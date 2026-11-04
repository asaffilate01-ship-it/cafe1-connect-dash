-- Audited atomic amendments for completed-but-unpaid Café 1 house tabs.
-- Keep payment settlement distinct from food/billing correction. The KDS order
-- and order number are retained. No external-provider balances are rewritten.
CREATE OR REPLACE FUNCTION public.cafe1_amend_unpaid_order(
  _order_id uuid,
  _expected_updated_at timestamptz,
  _reason text,
  _items jsonb,
  _notes text,
  _reopen_kitchen boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  actor uuid := auth.uid();
  old_order public.orders%ROWTYPE;
  existing_line public.order_items%ROWTYPE;
  updated_order public.orders%ROWTYPE;
  candidate jsonb;
  line_name text;
  line_notes text;
  line_qty integer;
  line_price integer;
  line_id uuid;
  saved_ids uuid[] := ARRAY[]::uuid[];
  old_lines jsonb;
  new_lines jsonb;
  new_subtotal bigint := 0;
  new_total bigint;
  updated_status public.order_status;
  update_message text := '';
  item_count integer := 0;
BEGIN
  IF actor IS NULL OR NOT (
    public.has_role(actor,'admin') OR public.has_role(actor,'staff')
  ) THEN RAISE EXCEPTION 'Only signed-in Café 1 staff can amend unpaid tabs'; END IF;
  IF _expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Reload the order before editing; its revision is missing'; END IF;
  IF length(trim(COALESCE(_reason,''))) < 4 OR length(_reason) > 220 THEN
    RAISE EXCEPTION 'Give a reason for the tab amendment (4–220 characters)'; END IF;
  IF length(COALESCE(_notes,'')) > 500 THEN
    RAISE EXCEPTION 'Kitchen note must be 500 characters or less'; END IF;
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR
     jsonb_array_length(_items) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Provide between 1 and 60 item lines'; END IF;
  SELECT * INTO old_order FROM public.orders
    WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unpaid order not found'; END IF;
  IF old_order.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'Another staff member updated this order. Reload before saving'; END IF;
  IF old_order.payment_status NOT IN ('on_account','pending') THEN
    RAISE EXCEPTION 'Paid or settled orders cannot be repriced here'; END IF;
  IF old_order.status IN ('cancelled','refunded') OR
     COALESCE(old_order.refunded_cents,0) <> 0 THEN
    RAISE EXCEPTION 'Refunded or cancelled orders cannot be amended'; END IF;
  IF old_order.source IN ('sumup_pos','deliveroo','just_eat','uber_eats','tgtg') THEN
    RAISE EXCEPTION 'External POS or marketplace orders must be amended in their source system'; END IF;
  IF old_order.sumup_checkout_id IS NOT NULL OR
     old_order.sumup_transaction_id IS NOT NULL OR
     old_order.voucher_cents > 0 OR
     old_order.voucher_holder_id IS NOT NULL THEN
    RAISE EXCEPTION 'Order contains a payment or funded voucher requiring a separate correction'; END IF;
  IF EXISTS (SELECT 1 FROM public.order_payments p WHERE p.order_id=old_order.id)
     OR EXISTS (SELECT 1 FROM public.payment_attempts a WHERE a.order_id=old_order.id)
     OR EXISTS (SELECT 1 FROM public.order_refunds f WHERE f.order_id=old_order.id)
  THEN RAISE EXCEPTION 'A payment/refund attempt exists; edit is locked for reconciliation'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',i.id,'name',i.name,'qty',i.qty,
      'unit_price_cents',i.unit_price_cents,'notes',i.notes
    ) ORDER BY i.created_at, i.id),'[]'::jsonb)
  INTO old_lines
  FROM public.order_items i WHERE i.order_id=old_order.id;

  FOR candidate IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    IF jsonb_typeof(candidate) <> 'object' THEN RAISE EXCEPTION 'Invalid order item'; END IF;
    line_name := btrim(candidate->>'name');
    line_notes := NULLIF(btrim(COALESCE(candidate->>'notes','')),'');
    IF line_name IS NULL OR length(line_name)<1 OR length(line_name)>120 OR
       length(COALESCE(line_notes,''))>200 THEN
      RAISE EXCEPTION 'Invalid item name or preparation note'; END IF;
    IF COALESCE(candidate->>'qty','') !~ '^[0-9]{1,2}$'
      OR COALESCE(candidate->>'unit_price_cents','') !~ '^[0-9]{1,6}$' THEN
      RAISE EXCEPTION 'Item quantities and unit prices must be whole-number pence'; END IF;
    line_qty := (candidate->>'qty')::integer;
    line_price := (candidate->>'unit_price_cents')::integer;
    IF line_qty NOT BETWEEN 1 AND 50 OR line_price NOT BETWEEN 0 AND 100000 THEN
      RAISE EXCEPTION 'Item quantity or unit price outside authorised limits'; END IF;
    new_subtotal := new_subtotal + (line_qty::bigint*line_price::bigint);
    IF new_subtotal>1000000 THEN RAISE EXCEPTION 'Maximum order subtotal is £10,000'; END IF;
    IF NULLIF(candidate->>'id','') IS NOT NULL THEN
      IF (candidate->>'id') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN
        RAISE EXCEPTION 'Invalid original item ID'; END IF;
      line_id := (candidate->>'id')::uuid;
      IF line_id = ANY(saved_ids) THEN RAISE EXCEPTION 'Repeated item line in amendment'; END IF;
      SELECT * INTO existing_line FROM public.order_items
        WHERE id=line_id AND order_id=old_order.id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Item no longer belongs to this order'; END IF;
      IF (existing_line.name, existing_line.qty, existing_line.unit_price_cents,
          COALESCE(existing_line.notes,'')) IS DISTINCT FROM
         (line_name,line_qty,line_price,COALESCE(line_notes,'')) THEN
        update_message := concat_ws('; ',NULLIF(update_message,''),
          'CHANGED '||left(existing_line.name,35)||' → '||left(line_name,35));
      END IF;
      UPDATE public.order_items SET
        name=line_name,qty=line_qty,unit_price_cents=line_price,notes=line_notes,
        -- Never leave the old "Mix grill" catalogue ID on a corrected meal.
        menu_item_id=CASE WHEN existing_line.name=line_name
                          THEN existing_line.menu_item_id ELSE NULL END,
        category_label=CASE WHEN existing_line.name=line_name
                            THEN existing_line.category_label ELSE NULL END
      WHERE id=line_id AND order_id=old_order.id;
    ELSE
      INSERT INTO public.order_items(
        order_id,name,qty,unit_price_cents,notes,menu_item_id,category_label
      ) VALUES (old_order.id,line_name,line_qty,line_price,line_notes,NULL,NULL)
      RETURNING id INTO line_id;
      update_message := concat_ws('; ',NULLIF(update_message,''),
        'ADDED '||line_qty||' × '||left(line_name,45));
    END IF;
    saved_ids := array_append(saved_ids,line_id);
    item_count := item_count+1;
  END LOOP;
  SELECT string_agg('REMOVED '||left(i.name,45),'; ')
  INTO line_notes FROM public.order_items i
  WHERE i.order_id=old_order.id AND NOT (i.id=ANY(saved_ids));
  IF line_notes IS NOT NULL THEN
    update_message := concat_ws('; ',NULLIF(update_message,''),line_notes);
  END IF;
  DELETE FROM public.order_items
    WHERE order_id=old_order.id AND NOT (id=ANY(saved_ids));

  -- Preserve existing delivery fees, promotions and pricing adjustments
  -- exactly; the item subtotal difference alone adjusts what remains due.
  new_total := old_order.total_cents +
               (new_subtotal - old_order.subtotal_cents);
  IF new_total NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION 'Adjusted total outside permitted limits'; END IF;
  updated_status := CASE WHEN _reopen_kitchen
    THEN 'preparing'::public.order_status ELSE old_order.status END;
  UPDATE public.orders SET
    subtotal_cents=new_subtotal::integer,
    total_cents=new_total::integer,
    delivery_notes=CASE WHEN _reopen_kitchen THEN
      left('UNPAID TAB AMENDMENT — PREPARE ONLY CHANGES: '||
        COALESCE(NULLIF(update_message,''),'Review edited order')||
        E'\nReason: '||_reason||E'\n'||
        COALESCE(_notes,''),500)
      ELSE NULLIF(btrim(COALESCE(_notes,'')),'') END,
    notes_manual=true,
    status=updated_status,
    updated_at=clock_timestamp()
  WHERE id=old_order.id AND updated_at=_expected_updated_at
  RETURNING * INTO updated_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order revision changed; reload before saving'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',i.id,'name',i.name,'qty',i.qty,
      'unit_price_cents',i.unit_price_cents,'notes',i.notes
    ) ORDER BY i.created_at,i.id),'[]'::jsonb)
    INTO new_lines FROM public.order_items i WHERE i.order_id=old_order.id;

  INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,terminal,detail)
  VALUES (actor,'order.unpaid_tab_amended','order',old_order.id,old_order.pos_terminal,
    jsonb_build_object(
      'reason',trim(_reason),
      'previous_status',old_order.status,
      'new_status',updated_status,
      'previous_total_cents',old_order.total_cents,
      'new_total_cents',new_total,
      'payment_status',old_order.payment_status,
      'reopened_for_kitchen',_reopen_kitchen,
      'previous_items',old_lines,
      'new_items',new_lines
    ));
  RETURN jsonb_build_object(
    'order_id',old_order.id,'order_number',old_order.order_number,
    'previous_total_cents',old_order.total_cents,
    'total_cents',new_total,'payment_status',old_order.payment_status,
    'status',updated_status,'updated_at',updated_order.updated_at,
    'items',new_lines
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.cafe1_amend_unpaid_order(
  uuid,timestamptz,text,jsonb,text,boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cafe1_amend_unpaid_order(
  uuid,timestamptz,text,jsonb,text,boolean
) TO authenticated, service_role;
COMMENT ON FUNCTION public.cafe1_amend_unpaid_order(uuid,timestamptz,text,jsonb,text,boolean)
IS 'Atomic audited Café 1 unpaid tab/pending manual order item and total amendment; never settles a payment and requires optimistic locking';

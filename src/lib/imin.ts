/**
 * iMin device bridge (built for the iMin D4-504 Android terminal).
 *
 * The D4 exposes its printer / cash box / second screen to the WebView through
 * a JS SDK object. Names differ between firmware builds, so we probe all of the
 * ones iMin and Sunmi have shipped and fall back to browser behaviour elsewhere.
 */

export type IminPrinter = {
  initPrinter?: () => void;
  setTextSize?: (n: number) => void;
  setAlignment?: (n: number) => void;
  setTextStyle?: (n: number) => void;
  printText?: (t: string, size?: number) => void;
  printAndLineFeed?: () => void;
  printAndFeedPaper?: (n: number) => void;
  partialCut?: () => void;
  fullCut?: () => void;
  sendRAWData?: (d: string) => void;
  openCashBox?: () => void;
  opencashBox?: () => void;
  getPrinterStatus?: () => unknown;
};

type IminWindow = Window & {
  iminPrinter?: IminPrinter;
  imin?: { printer?: IminPrinter; presentation?: unknown } & Record<string, unknown>;
  sunmiPrinter?: IminPrinter;
  AndroidPrinter?: IminPrinter;
  innerPrinter?: IminPrinter;
  iminDualScreen?: { show?: (url: string) => void; open?: (url: string) => void; start?: (url: string) => void };
  IminDualScreen?: { show?: (url: string) => void; open?: (url: string) => void; start?: (url: string) => void };
};

function w(): IminWindow | null {
  return typeof window === "undefined" ? null : (window as IminWindow);
}

export function getIminPrinter(): IminPrinter | null {
  const g = w();
  if (!g) return null;
  return g.iminPrinter ?? g.imin?.printer ?? g.innerPrinter ?? g.sunmiPrinter ?? g.AndroidPrinter ?? null;
}

export function isIminDevice(): boolean {
  return !!getIminPrinter();
}

/* ------------------------------------------------------------------ */
/* Printing                                                            */
/* ------------------------------------------------------------------ */

const ESC = "\x1B";
const GS = "\x1D";

export type TicketLine = { name: string; qty: number; price_cents?: number; notes?: string | null };
export type Ticket = {
  heading: string; // e.g. "KITCHEN" / "COUNTER"
  order_number: number;
  fulfilment?: string;
  terminal?: string | null;
  lines: TicketLine[];
  total_cents?: number;
  footer?: string;
};

/** 58mm paper on the D4-504 = 32 characters at normal size. */
const COLS = 32;

function row(left: string, right: string): string {
  const l = left.slice(0, COLS - right.length - 1);
  return l + " ".repeat(Math.max(1, COLS - l.length - right.length)) + right;
}

function money(cents: number): string {
  return `£${(cents / 100).toFixed(2)}`;
}

export function ticketToText(t: Ticket): string {
  const out: string[] = [];
  out.push("CAFE 1 ST ALBANS");
  out.push(t.heading);
  out.push("-".repeat(COLS));
  out.push(`ORDER #${t.order_number}`);
  if (t.fulfilment) out.push(t.fulfilment.toUpperCase());
  if (t.terminal) out.push(t.terminal.toUpperCase());
  out.push(new Date().toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }));
  out.push("-".repeat(COLS));
  for (const l of t.lines) {
    out.push(row(`${l.qty} x ${l.name}`, l.price_cents != null ? money(l.price_cents * l.qty) : ""));
    if (l.notes) out.push(`   * ${l.notes}`);
  }
  out.push("-".repeat(COLS));
  if (t.total_cents != null) out.push(row("TOTAL", money(t.total_cents)));
  if (t.footer) out.push(t.footer);
  return out.join("\n") + "\n";
}

/** Prints through the built-in D4-504 printer. Returns false when there is no device bridge. */
export function iminPrintTickets(tickets: Ticket[]): boolean {
  const p = getIminPrinter();
  if (!p) return false;
  try {
    p.initPrinter?.();
    for (const t of tickets) {
      const text = ticketToText(t);
      if (p.printText) {
        p.setAlignment?.(1);
        p.setTextSize?.(26);
        p.printText(text, 26);
        p.printAndFeedPaper?.(12);
      } else if (p.sendRAWData) {
        p.sendRAWData(`${ESC}@${ESC}a\x01${text}${GS}V\x42\x00`);
      } else {
        return false;
      }
      (p.partialCut ?? p.fullCut)?.();
    }
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Second (customer) screen                                            */
/* ------------------------------------------------------------------ */

/**
 * Opens the customer display. On the iMin dual-screen firmware the URL is
 * pushed to the rear LCD; otherwise we open a popup window that staff can drag
 * onto the second monitor.
 */
export function openCustomerScreen(url = "/display"): { ok: boolean; message: string } {
  const g = w();
  if (!g) return { ok: false, message: "Not available here" };
  const abs = new URL(url, g.location.origin).toString();

  const ds = g.iminDualScreen ?? g.IminDualScreen;
  const push = ds?.show ?? ds?.open ?? ds?.start;
  if (push) {
    try {
      push(abs);
      return { ok: true, message: "Customer screen started on the second display" };
    } catch {
      /* fall through */
    }
  }

  const win = g.open(abs, "cafe1-customer-display", "popup=yes,width=1280,height=800");
  return win
    ? { ok: true, message: "Customer screen opened — drag it onto the second display" }
    : { ok: false, message: "Allow pop-ups on this device to use the customer screen" };
}

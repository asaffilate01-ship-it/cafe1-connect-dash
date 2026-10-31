<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Rules

- Every `public` table whose RLS policy allows `anon` or `authenticated` reads must also carry an explicit `GRANT SELECT` to that role; a policy alone is not enough and visitors get "permission denied for table" (business_settings and menu_items were both missing it).

## Design system and QA
- Read `DESIGN.md` and `PRODUCT.md` before any marketing, dashboard, mobile or workflow UI edit.
- Use Taste Skill for art direction, Impeccable to critique/audit/harden and Awesome DESIGN.md as a documentation reference; never duplicate another brand identity.
- Preserve existing security/permissions, finance/booking logic and published Lovable git history; no force pushes.
- Run existing test/build checks, advisory `npx --yes impeccable@4.8.0 detect src/` and rendered responsive/keyboard verification.

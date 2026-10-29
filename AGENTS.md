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


# Email accounts and deployment

Email sign-in is implemented but needs a live Supabase project before it can send real codes. A public GitHub repository is source hosting; it does not activate the account service.

1. Enable email authentication and signups in your Supabase project.
2. Configure the email template to include the six-digit `{{ .Token }}` code. Use a six-digit OTP configuration; a magic-link-only template does not match the app's code-entry screen.
3. Configure email delivery for the intended recipients. Supabase's default service is restricted; external users need the project's supported SMTP configuration.
4. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the exact HTTPS `APP_ORIGIN` in the hosting provider's environment settings. Use a publishable key, never a service-role key. Keep actual settings out of Git.
5. Leave `TRUST_SITES_AUTH=false` on independently hosted deployments.
6. Test code request, verification, save, reload, session refresh, and sign-out with a real email address before inviting users.

For the original private Sites deployment, visitors also face a hosting access gate. After real email sign-in works, changing that Site's audience to public lets visitors reach HabitLab without a ChatGPT account. Changing GitHub repository visibility has no effect on this gate.

## Sessions and existing accounts

Supabase verifies email identity on the server. Tokens stay in HttpOnly cookies with SameSite protection and Secure/`__Host-` attributes in production. The server validates the origin of write requests and never returns provider tokens to browser JavaScript. Every database query is scoped by account identity.

`TRUST_SITES_AUTH=true` explicitly enables the original platform identity path. Only use it behind trusted Sites ingress that removes visitor-supplied identity headers, or with the localhost-only Vite test user. With Supabase configured, it only enables migration from a matching authenticated legacy session; ordinary access still requires email authentication. Existing records migrate only when both sessions are authenticated and their emails match. Do not enable migration by trusting raw headers on a public Worker.

## Optional AI

Set `OPENAI_API_KEY` as a server secret to enable AI wording. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. The app sends the selected habit, recent conversation, and the engine's recommendation to that service. Without the key, or if the request fails, the behavior coach supplies the answer.

## References

- [Supabase email passwordless authentication](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Cloudflare local D1 development](https://developers.cloudflare.com/d1/best-practices/local-development/)
- [Cloudflare database migrations](https://developers.cloudflare.com/d1/reference/migrations/)

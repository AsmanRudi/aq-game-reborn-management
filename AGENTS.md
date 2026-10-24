# AQ Game Reborn Management — agent instructions

## Project boundary
- This is a separate rental-management application. Keep all changes inside this directory.
- The sibling FoodApp is unrelated and must not be edited, migrated, or used for runtime data.
- Follow the approved product, flow, technical, database, and test specifications in `docs/`.

## Engineering rules
- Use Indonesian for user-facing text and `Asia/Jakarta` for presentation. Persist instants in UTC (`timestamptz`); never derive elapsed rental time by counting browser timer ticks.
- Keep money as integer Rupiah. Snapshot the rate and pricing rule on each rental/booking so later tariff edits do not rewrite history.
- Enforce booking/session overlap and station availability on the server inside database transactions. Treat client validation as convenience only.
- Validate all external input with Zod. Protect passwords with a modern password hash; never expose secrets or hashes to the browser.
- Use role checks on every protected operation. Cashiers cannot manage staff, tariffs, audit records, or database backup/restore.
- Preserve financial history. Corrections use void/refund/adjustment records and audit events, never ordinary hard deletion.
- Manual QRIS is a payment recording method only; do not imply gateway verification. Avoid claims of TV/WhatsApp integration.
- Add tests for changed behavior. Do not report checks as passing unless executed.
- Never run destructive migrations, erase data, or deploy to production without explicit review and approval.

## Commands
- Root workspace: `npm run dev`, `npm run build`, `npm test`.
- Database: `npx prisma migrate dev` for local development only; review migrations before applying elsewhere.
- Keep environment files out of version control; document required variables in `.env.example`.

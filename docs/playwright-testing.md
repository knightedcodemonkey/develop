# Playwright Testing Notes

## WebKit and HTML Dialog Overlays

WebKit can be sensitive to Playwright actionability checks when interacting with
HTML `<dialog>` overlays. In some flows, role-based or standard click actions can
time out even when controls are visibly rendered and usable.

Use this fallback pattern for dialog confirmation flows when WebKit flakes:

1. Target the dialog by stable id (for example: `#clear-confirm-dialog`) instead
   of a broad `getByRole('dialog')` selector.
2. Use `evaluate`-based click for submit/confirm controls inside the dialog.
3. Scope text assertions to the dialog locator to avoid matching background UI.

Keep accessible selectors as the default in tests. Use this dialog fallback only
for known WebKit top-layer interaction issues.

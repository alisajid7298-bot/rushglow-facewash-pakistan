# RushGlow isolated Baileys test

Only link 03427278255. Owner account and official API are unchanged.
Requires Node.js 20+ and an online laptop. This unofficial client may cause account restriction. Keep private-session secret; never upload it.

Windows PowerShell, from this directory:

```powershell
npm install
$env:TEST_CUSTOMER_NUMBERS="923XXXXXXXXX"
npm start
```

Replace the test customer number with a DIFFERENT phone you control. Only that phone can trigger replies. Scan the QR using 03427278255 > WhatsApp > Linked devices. Send MENU from the other phone. Products use the live site catalog. Buttons are text choices in this demo. No real orders, notifications or payments are created. Do not transfer Easypaisa funds during testing. Session/chat state must not be shared; stop with Ctrl+C and unlink the device on the phone when done. This is a test harness, not a production bridge. LID-addressed messages are currently ignored. Laptop sleep stops replies.

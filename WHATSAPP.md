# Customer credit updates on WhatsApp

In Customer debit, select a customer and business date, then select **Send credit update on WhatsApp**. Preview the recipient and the day's amounts. **Open in WhatsApp** opens a draft for you to send using WhatsApp or WhatsApp Web. Save the customer’s international phone number in their profile. Pakistani mobile numbers beginning with 03 are also recognized. Ledger entries stay available offline. Sending requires internet access.

## Optional WhatsApp Business Platform sender

Set this up now or later. Manual chat sharing works independently. The optional sender runs in a private GitHub Codespace and uses your own WhatsApp Business Platform number. Meta's account requirements and messaging charges apply. A running Codespace uses your GitHub allowance.

1. In WhatsApp Manager, register your sending number and get an approved **utility** template with seven positional body parameters and no header or buttons. Suggested body:

   > {{1}} account update for {{2}} on {{3}}. Opening balance: PKR {{4}}. Credit added: PKR {{5}}. Payment received: PKR {{6}}. Closing balance: PKR {{7}}. Thank you.

2. In your GitHub account's **Settings → Codespaces → Secrets**, make these secrets available to this repository. Use `WA_TOKEN` for your Meta access token with `whatsapp_business_messaging` permission, `WA_PHONE_ID` for the sending phone-number ID, `WA_GRAPH_VERSION` for the supported API version from your Meta configuration (including the v), and `WA_TEMPLATE` and `WA_LANGUAGE` for the approved template name and exact language code. Keep the token in Codespaces secrets.
3. Open or restart a Codespace for this repository, update to the latest main branch, and run `node whatsapp-sender.mjs` with Node 20 or later. In **Ports**, forward port **3100** and keep its visibility **Private**. Leave the sender running while you use it.
4. In the station dashboard, open **Setup → WhatsApp integration → Configure WhatsApp**. Save the private HTTPS port address printed by the sender. The address is saved in this station browser. You can clear it at any time.
5. Sign into the private port using the GitHub account that owns the Codespace. In Forecourt, preview a customer update and choose **Review in Business sender**. Confirm the recipient and customer consent, enter the sender code printed in your Codespace terminal, and press **Send credit update**. A new sender code is generated each time the process starts. If a GitHub sign-in redirects away from the draft, open the preview again from Forecourt.

The confirmation reports Meta's acceptance for sending. Delivery and read status are available separately through your business messaging tools. If the result is uncertain, check your account before retrying.

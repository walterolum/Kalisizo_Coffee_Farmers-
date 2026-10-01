# CMS Guide — Kalisizo Coffee Cooperative

This guide is for the staff who maintain the website. You need a username and
password from the Super Administrator.

Go to **`/admin`** on the website (for example `https://your-domain/admin`) and
sign in.

> ### Implementation status — read this first
 >
> This guide covers the CMS **as it is built today**. The admin screens are:
> **Overview, Inquiries, Home, About & Leadership, Services, Products &
> Catalog, Success Stories, Store Location, Contact Us, News, Events, Projects,
> Announcements, Publications, Pages, Gallery albums, Gallery images, Users,
> Activity, Settings.**
>
> Every content type on the public site can be managed from the CMS. The
> editorial screens (News through Gallery images) share one interface: a list of
> records, a **New…** button, and an edit form whose extra fields — media, search
> engine settings, publishing options — are tucked into collapsible sections.
>
> Some screens are limited by your role, and some only appear for the roles that
> may use them. If a tab is missing, that is a permission limit rather than a
> fault. See section 2.

---

## 1. Signing in

Enter the email address and password you were given, then select **Sign in**.

If you have been signed out unexpectedly, or an administrator has deactivated
your account, the CMS will tell you. Ask the Super Administrator to re-activate
it.

For security, sign out when you finish using a shared computer.

---

## 2. What you can do

Your role decides what you can do.

| Role | Summary |
| --- | --- |
| **Editor** | Write and edit drafts, upload images. Cannot publish. |
| **Content Administrator** | Everything an Editor can do, plus publish, archive, edit programs/products/locations, and change site settings. |
| **Super Administrator** | Everything, plus user accounts, restoring archived content, and the activity log. |

If a button is missing or greyed out, it is a permission limit, not a fault.
Ask a Content Administrator or Super Administrator if you need it.

---

## 3. The editorial workflow

Every article, project, event and document moves through four states:

| State | Meaning |
| --- | --- |
| **Draft** | Only visible in the CMS. Not on the website. |
| **In review** | Submitted for a check. Still not on the website. |
| **Published** | Live on the public website. |
| **Archived** | Removed from the website but kept, so it can be brought back. |

A typical flow:

1. Create the item and save it as **Draft**.
2. Set the **Status** dropdown to **In review**.
3. Ask a Content Administrator or Super Administrator to check it.
4. They set it to **Published**.

**Saving an item does not publish it.** You must change the status explicitly.
This is deliberate: it stops something going live by accident.

The publish date is set automatically the first time you publish. If you unpublish
or archive, the date is cleared, and the original date is kept if you publish
again.

---

## 4. Writing content

The fields available depend on which screen you are in. On the screens that exist
today:

| Screen | What you edit |
| --- | --- |
| **Home** | The hero banner — headline, subtext, background image, buttons |
| **About & Leadership** | Mission and vision text, and each committee member's name, role, photo and biography |
| **Services** | Each program: title, tagline, bullet points, image |
| **Products & Catalog** | Each product: name, category, description, price, unit, image, availability |
| **Success Stories** | Each farmer or member story: quote, name, role, image |
| **Store Location** | Office name, address, district, phone, email, map position, main-branch flag |
| **Contact Us** | Phone numbers, official email, office address, social media links, opening hours |

When you write copy:

- Keep headings and sentences clear and specific. They appear in search results
  and social shares.
- Write for a farming cooperative audience. Plain language, short sentences.
- Always describe an image in its **alt text**. Say what the picture shows, for
  example *"Members sorting coffee cherries at the Kalisizo washing station"*,
  not just *"photo"*. This is what makes the site usable with a screen reader.

### Images

Upload a **JPEG, PNG, WebP or GIF**, up to **8 MB**.

The CMS checks the file's actual contents, not just its name, so a file that is
really a document or a web page will be rejected.

Images are resized automatically for phones, tablets and desktop. You do not need
to resize anything before uploading.

Images are stored in Cloudinary when it is configured. If it is not, they are
stored on the site's own server instead, which behaves identically from the CMS —
the difference only matters to whoever runs the server.

---

## 5. Publishing to the website

Once an item is **Published** it appears on the public site straight away. There
is no separate "push live" step, and no redeploy is needed.

Every list page — news, projects, events, gallery, publications, products — shows
only published items. Drafts and archived items never appear.

Saving a change to an item that is already live updates it immediately. To take
a change live for the first time, set its status to **Published** and save.

> If you cannot see **Published** as a status, that is a role limit. See
> section 2. An Editor's picks are deliberately limited to what the system will
> accept, rather than showing options that fail when saved.

---

## 6. Archiving and restoring

Use **Archive** (never "delete") to take something off the website by mistake or
because it is out of date.

- Archived content is hidden from the public site immediately.
- Nothing is destroyed, so it can be restored.
- A **Super Administrator** can restore archived content.

To find archived items, set the **Status** filter at the top of the list to
**Archived**. The filter is the only place archived items are listed; the default
list shows live and draft work only, so nothing out of date is mistaken for
current. The **Restore** button appears on each row there.

> The site blocks archiving the **last** program and the **last** store location,
> because the website needs at least one of each to display correctly.

---

## 7. Site settings

Content Administrators and Super Administrators can open **Settings** and update:

- Official phone numbers, email address and office address
- Social media links
- The homepage hero text and badges

These appear in the site header, footer and contact section across the whole
website.

Changing a phone number, address or social link changes it everywhere on the
site at once.

---

## 8. Activity log and user accounts

**Super Administrators** can see an **activity log** recording who created,
edited, published, archived or restored content, and when. It is read-only and
exists for traceability — for example if something went live that should not
have. Use the filters to narrow it to one person, one action or one content
type.

**Super Administrators** can also manage staff accounts: add a user, change
someone's role, deactivate an account, or reset a forgotten password. A
deactivated user cannot sign in and their existing session stops working
immediately.
- Super Administrators cannot remove or demote the last active Super
  Administrator, so the site can never be left without an administrator.

---

## 9. Contact inquiries

Enquiries sent through the website's contact form appear in the CMS. A Content
Administrator or Super Administrator can read them and mark them as handled.

If notification email is configured, a copy is also emailed to the cooperative
inbox.

---

## 10. Common problems

| Problem | What to do |
| --- | --- |
| "Your role cannot publish content" | Ask an administrator to review and publish it. |
| "This account is no longer active" | Your account was deactivated. Contact the Super Administrator. |
| I cannot see **Published** in the status list | Your role cannot publish. Ask a Content Administrator or Super Administrator. |
| An image does not appear after uploading | Wait a few seconds and refresh. If it still fails, check the file is a JPEG, PNG, WebP or GIF under 8 MB. |
| An upload fails with "uploads are not configured" | The server has no image storage set up. Report it — this is a server configuration problem, not something you can fix. |
| An uploaded image is missing or shows a broken icon | Wait a few seconds and refresh. If it persists, tell an administrator the image name and which page it should appear on. |
| I cannot find something I archived | Set the **Status** filter to **Archived** at the top of the list. Archived items are not shown in the default list. |
| The **Album** or **Project** list is empty when editing a photo | Create an album or project first, then come back. A photo with no album is still valid and shows on its own. |
| I cannot archive an item | It may be the last program or store location. The site must always keep at least one of each. |
| The page still shows old text | Press refresh, or open the page in a private/incognito window. |
| A section shows "No articles yet" | Nothing has been published in that section yet. Publish a draft to fill it. |

---

## 11. Known limitations

- **Signed-in sessions last up to 8 hours.** Sign out when you finish, especially
  on a shared computer.
- **Photo uploads are not available in the CMS.** Add a photo by pasting its web
  address into the image field instead.
- **The status list only offers moves the system allows** from the item's current
  status, so a draft cannot be made live without going through the list.
- **The activity log is read-only and kept indefinitely**, so it grows over time.
  Use the filters to narrow it.

If a feature you need is not here, ask your Super Administrator.

---

## 12. Getting help

Contact your Super Administrator for anything not covered here, including:

- A new CMS account
- Restoring archived content
- Restoring a permanently removed item
- Any setting you are unsure about
- The sections listed in section 11

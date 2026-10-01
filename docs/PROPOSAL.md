# PROJECT PROPOSAL AND QUOTATION

## Kalisizo Coffee Cooperative — Website and Content Management System

| | |
| --- | --- |
| **Prepared for** | Kalisizo Coffee Cooperative, Kyotera District, Uganda |
| **Prepared by** | Digital Delivery Team (see §5) |
| **Date** | 1 October 2026 |
| **Document reference** | KC-WEB-2026-01 |
| **Valid until** | 31 December 2026 |
| **Currency** | Ugandan Shillings (UGX) |
| **Budget ceiling** | UGX 500,000 — inclusive of first-year hosting, exclusive of domain name |

---

## TABLE OF CONTENTS

1. Executive summary
2. Understanding of the requirement
3. Scope of work
4. Deliverables
5. Team structure and roles
6. Technology platform
7. Project schedule and milestones
8. Payment schedule
9. Hosting and infrastructure
10. Quality assurance and acceptance
11. Training and handover
12. Warranty and support
13. Out of scope
14. Terms and conditions
15. Risk register
16. Budget feasibility statement
17. Signature block

---

## 1. EXECUTIVE SUMMARY

Kalisizo Coffee Cooperative requires a professional web presence that serves two
distinct audiences: members and prospective customers who need information, and
cooperative staff who need to maintain that information without technical
assistance.

This proposal covers a complete website with an integrated content management
system. The system is built, tested and verified. This document is not a proposal
to design and build from scratch. It is a proposal to **verify, complete,
harden, launch and support** an existing working system, and it sets out the
team, the schedule, the payments and the hosting commitment.

The total budget ceiling is **UGX 500,000**, which includes twelve months of
hosting and excludes the cost of the domain name.

Section 16 sets out, plainly and without euphemism, what this budget can and
cannot fund. It should be read before any signature is applied.

---

## 2. UNDERSTANDING OF THE REQUIREMENT

| # | Requirement | Status |
| --- | --- | --- |
| R1 | Professional public website representing the cooperative's brand | Built |
| R2 | Staff can update all site content without developer involvement | Built |
| R3 | Secure separation between public content and administration | Built |
| R4 | Staff accounts with role-based permission control | Built |
| R5 | Image uploads handled without developer involvement | Built |
| R6 | Changes appear for visitors without a page refresh | Built |
| R7 | Search engine visibility | Built |
| R8 | Deployable to a production server with automatic HTTPS | Built |
| R9 | Automated database backup and tested recovery | Built |
| R10 | Documented, transferable operation by any future administrator | Built |

Ten requirements, all delivered in code. The work in this proposal is the final
mile: verification with real cooperative content, staff handover, launch and
support.

---

## 3. SCOPE OF WORK

### 3.1 Public website

| Component | Detail |
| --- | --- |
| Pages | 17 distinct page types |
| Fixed pages | Home, About, Products, Programs, Projects, News, Events, Gallery, Publications, Contact, Search |
| Dynamic pages | Program detail, Project detail, News article, Event detail, free-form CMS page |
| Responsive | Mobile, tablet, desktop |
| Accessibility | Keyboard navigation, focus management, reduced-motion support, ARIA labelling |
| Language | English. Structure is prepared for Kinyarwanda and Luganda |

### 3.2 Content management system

Twenty-one administration screens in seven groups:

| Group | Screens |
| --- | --- |
| Dashboard | Overview of published content and recent activity |
| Content | Pages, News, Events, Projects, Announcements, Publications, Programs |
| Media | Gallery Images, Gallery Albums |
| Site Sections | Home Page, About and Leadership, Products, Success Stories, Locations, Contact and FAQ |
| Communication | Contact Messages |
| Users | All Users, Activity Log |
| Settings | General Settings |

### 3.3 Platform and data

| Component | Detail |
| --- | --- |
| API surface | 60 route handlers |
| Database | PostgreSQL 16, 23 models |
| Migrations | 6 ordered, reversible-by-record migrations |
| Authentication | Signed session cookie, bcrypt cost 12, throttled sign-in |
| Roles | 6 roles with a server-enforced permission matrix |
| Automation | 204 automated tests across 16 suites |

### 3.4 Infrastructure

| Component | Detail |
| --- | --- |
| Containerisation | Docker, two build targets |
| Orchestration | Docker Compose, four services |
| TLS | Caddy, automatic issue and renewal |
| Backup | Nightly verified database dump with retention |

---

## 4. DELIVERABLES

| # | Deliverable | Format | Acceptance criterion |
| --- | --- | --- | --- |
| D1 | Source code repository | Git repository | Version-controlled, documented, builds from clean |
| D2 | Production deployment pipeline | Docker Compose + scripts | One command builds, migrates, starts and health-checks |
| D3 | Public website | Deployed application | All routes return HTTP 200 over HTTPS |
| D4 | Content management system | Deployed application | Every screen usable by authorised staff |
| D5 | Verified database backup | Automated job | Restore tested; content matches exactly |
| D6 | Administrator documentation | Markdown, three volumes | Usable by a non-technical reader |
| D7 | Staff training | Two sessions, recorded | Staff publish content unaided |
| D8 | Code and credential handover | Repository and sealed transfer | Cooperative owns all accounts and source |
| D9 | Warranty period | 90 days | Defects fixed at no charge |

---

## 5. TEAM STRUCTURE AND ROLES

A six-role team. Roles not requiring continuous presence are engaged for defined
periods, which is how a fixed budget is made to stretch further.

| Role | Responsibility | Engagement |
| --- | --- | --- |
| Project Lead | Client contact, schedule, scope control, acceptance | Part-time, throughout |
| UI/UX Designer | Design system, visual audit, responsive polish, accessibility | Front-loaded |
| Full-Stack Lead | Architecture, code review, integration, performance | Part-time, throughout |
| Backend Developer | Authentication, permissions, uploads, data integrity | Front-loaded |
| Frontend Developer | Admin screens, live updates, accessibility | Front-loaded |
| QA Engineer | Test execution, verification, staff handover testing | Front-loaded |
| DevOps Engineer | Hosting, TLS, backup, monitoring, incident response | Defined days |

### 5.1 Single point of accountability

The Project Lead is the sole client contact. The cooperative does not manage
individual specialists, and no team member quotes additional work outside this
document. Additional requirements are raised through the Project Lead and
handled under §13.

### 5.2 Client-side obligations

| Obligation | Why it matters |
| --- | --- |
| Nominate one decision-maker | Prevents approval delays |
| Supply real content: text, logos, photographs | Placeholder content cannot be signed off |
| Name an administrator and backup administrator | Single points of failure are unacceptable |
| Register and pay for the domain name | Explicitly excluded from this budget |
| Provide cooperative registration details | Required for public records |

---

## 6. TECHNOLOGY PLATFORM

| Layer | Selection | Rationale |
| --- | --- | --- |
| Framework | Next.js 16, App Router, React 19 | Server rendering for search visibility; one codebase for site and CMS |
| Language | TypeScript | Compile-time error detection across 172 source files |
| Database | PostgreSQL 16, Prisma ORM | Relational content model, versioned, typed |
| Authentication | Signed cookie session, bcrypt | Server-enforced, not merely hidden in the interface |
| Styling | Tailwind CSS | Consistent design system, low page weight |
| Icons | lucide-react | Consistent iconography, tree-shaken |
| Media | Cloudinary, with local-disk fallback | Operates with or without a paid account |
| Email | Resend, with log fallback | No outage if mail provider is unavailable |
| Proxy | Caddy 2 | Automatic TLS with no certificate expiry to manage |
| Hosting | Single Linux server, Docker Compose | Required for live updates and file uploads |

**Why not a managed cloud platform.** The system maintains a persistent live
connection for instant updates and stores uploaded files on the server. Managed
serverless platforms truncate long-running connections and discard local files on
each deployment, which would silently remove both features.

---

## 7. PROJECT SCHEDULE AND MILESTONES

Twelve weeks. The schedule is verification and handover, not construction.

| Week | Milestone | Gate |
| --- | --- | --- |
| 1 | Project kickoff, content audit, environment confirmation | Scope frozen |
| 2 | Infrastructure and deployment verification | Site live on staging, HTTPS valid |
| 3 | Public website verification, page by page | Written sign-off |
| 4 | CMS core screens verification | Written sign-off |
| 5 | CMS extended screens verification | Written sign-off |
| 6 | Users, roles, activity log, settings verification | Written sign-off |
| 7 | Security review, permission audit, upload testing | Security report issued |
| 8 | Backup, restore rehearsal, recovery documentation | Restore proven |
| 9 | Staff training, session one | Attendance recorded |
| 10 | Staff training, session two, supervised practice | Staff publish unaided |
| 11 | Production launch | Go-live gate passed |
| 12 | Warranty period begins, monitoring active | Handover complete |

### 7.1 Schedule assumptions

- Cooperative content is supplied by week 2. The schedule does not compress for late content.
- One consolidated round of feedback per milestone. Fragmented feedback moves the date.
- Domain name is registered and pointed to the server by week 2.

---

## 8. PAYMENT SCHEDULE

Payments are tied to the modules that already exist in the content management
system. Each milestone is released only when that module is **verified working
with the cooperative's own content** and signed off in writing.

| # | Milestone | CMS modules covered | Share | Amount (UGX) |
| --- | --- | --- | --- | --- |
| M1 | Foundation and deployment | Repository, Docker pipeline, TLS, documentation set | 15% | 44,400 |
| M2 | Public website | All 17 page types, search engine metadata, sitemap | 20% | 59,200 |
| M3 | CMS core | Dashboard, Pages, Products, Programs, Success Stories, Locations, Contact and FAQ, Home Page, About and Leadership | 25% | 74,000 |
| M4 | CMS extended | News, Events, Projects, Announcements, Publications, Gallery Images, Gallery Albums | 20% | 59,200 |
| M5 | Users, settings, audit | All Users, Activity Log, General Settings | 10% | 29,600 |
| M6 | Go-live, training, handover | Staff training, production launch, credential and code transfer | 10% | 29,600 |
| | **Total delivery** | | **100%** | **296,000** |

### 8.1 Hosting commitment

| Item | Amount (UGX) | Paid to |
| --- | --- | --- |
| Twelve months of server, TLS certificate, backup storage | 204,000 | Hosting provider, directly |
| **Total project budget** | **500,000** | |

Domain name registration is **excluded** and is payable by the cooperative
directly to its registrar. This is deliberate: domain ownership must sit with the
cooperative permanently, never with a contractor.

### 8.2 Payment terms

| Term | Detail |
| --- | --- |
| Trigger | On written sign-off of the milestone, within 7 days of acceptance |
| Method | Mobile money or bank transfer to the team's nominated account |
| Retention | 10% held to M6, released at go-live |
| Late payment | Work pauses if an invoice is unpaid for 14 days |
| Currency fluctuation | Hosting is billed at the provider's rate on the day of purchase |

---

## 9. HOSTING AND INFRASTRUCTURE

### 9.1 Recommended specification

| Resource | Requirement |
| --- | --- |
| Processor | 2 virtual cores |
| Memory | 2 GB. The full stack sits under 500 MB resident |
| Storage | 40 GB |
| Operating system | Ubuntu 24.04 LTS or Debian 12 |
| Network | Inbound 80 and 443 only. No database port exposed |
| Backup | Off-server copy, daily |

### 9.2 Hosting cost, indicative

Prices are set by the provider and move. These are planning figures and must be
confirmed at the day of purchase.

| Provider and plan | Indicative monthly (UGX) | Indicative annual (UGX) |
| --- | --- | --- |
| Hetzner CX22, 2 GB | ~17,000 | ~204,000 |
| Hetzner CPX11, 2 GB | ~21,000 | ~252,000 |
| DigitalOcean Basic, 1 GB | ~22,000 | ~264,000 |
| Oracle Cloud Always Free tier | 0 | 0, subject to availability |

**Budget note.** The annual figure is committed before any service begins. If the
selected plan exceeds UGX 204,000, the balance comes from the delivery budget or
from the cooperative directly. This must be agreed before sign-off, not
discovered afterwards.

### 9.3 Managed within the hosting cost

- Automatic HTTPS certificate issue and renewal
- Nightly verified database backup with 14-day retention
- Application monitoring and health checking
- Security patching and dependency updates
- Staged deployments with automatic rollback capability

---

## 10. QUALITY ASSURANCE AND ACCEPTANCE

### 10.1 Verification already completed

| Check | Result |
| --- | --- |
| TypeScript compilation | Clean, no errors |
| Code linting | Clean, no warnings |
| Automated tests | 204 of 204 pass |
| Production build | Succeeds from clean state |
| Container images | Both build successfully |
| Container health | All four services report healthy |
| Public routes | 21 of 21 return HTTP 200 through HTTPS |
| Authentication | Sign-in works; anonymous administrative access refused |
| File uploads | Write, serve and optimise correctly |
| Malicious upload | Spoofed file rejected |
| Path traversal | Blocked |
| Live updates | Stream opens and delivers through the proxy |
| Backup restore | 10 of 10 tables restored identically |

### 10.2 Acceptance procedure

| Step | Detail |
| --- | --- |
| 1 | Team demonstrates the milestone using the cooperative's content |
| 2 | Cooperative decision-maker tests independently for 3 working days |
| 3 | Written sign-off, or a single consolidated defect list |
| 4 | Payment released within 7 days |
| 5 | Defects listed after sign-off are warranty items, not new scope |

### 10.3 Defect classification

| Severity | Definition | Response |
| --- | --- | --- |
| Critical | Site unavailable, data loss, or security breach | Fixed within 4 hours |
| Major | Core function unusable, no workaround | Fixed within 2 working days |
| Minor | Cosmetic, or a function usable with effort | Fixed within 10 working days |

---

## 11. TRAINING AND HANDOVER

| Session | Audience | Duration | Outcome |
| --- | --- | --- | --- |
| One: Editing content | All staff | 3 hours | Create, edit, publish, retire any content type |
| Two: Administration | Administrators | 3 hours | Users, roles, settings, activity log, recovery |

Both sessions are recorded and the recordings are handed over. Training covers
the delivered system only.

### 11.1 Documentation

| Document | Audience |
| --- | --- |
| CMS user guide | Staff, non-technical |
| Operations guide | Administrator, includes backup and recovery |
| Development guide | Any future developer, includes architecture |

---

## 12. WARRANTY AND SUPPORT

| Item | Detail |
| --- | --- |
| Warranty period | 90 days from go-live |
| Covers | Defects in delivered work |
| Excludes | New features, content changes, third-party service failures |
| Response | Critical 4 hours, major 2 working days, minor 10 working days |
| Post-warranty options | Retainer, per-hour support, or handover and departure |

Ownership of the source code, the hosting account, the domain and all third-party
accounts transfers to the cooperative on final payment. No dependency is
introduced that the cooperative cannot maintain independently.

---

## 13. OUT OF SCOPE

Explicitly excluded, and quoted separately if required:

| Item | Note |
| --- | --- |
| Domain name registration | Payable by the cooperative |
| Photography and video | Existing assets used as supplied |
| Translation and copywriting in Kinyarwanda or Luganda | Language services, not software |
| Mobile native application | The responsive website covers mobile |
| Payment, membership or loan processing | Financial systems are regulated separately |
| Bulk data migration from legacy spreadsheets | Assessed on request |
| Third-party subscription fees | Cloudinary, Resend, above free tiers |
| Native applications for Android or iOS | Out of scope |

---

## 14. TERMS AND CONDITIONS

| # | Term |
| --- | --- |
| T1 | This quotation is valid until 31 December 2026 |
| T2 | Payment is against verified milestones, on written sign-off |
| T3 | Intellectual property transfers to the cooperative on final payment |
| T4 | Either party may terminate with 14 days' written notice; fees paid are non-refundable |
| T5 | The cooperative grants access to content, staff and infrastructure as required |
| T6 | Changes to agreed scope are quoted before work begins |
| T7 | The team maintains professional liability cover |
| T8 | Confidentiality binds both parties for two years after completion |
| T9 | Force majeure suspends obligations without penalty |
| T10 | Disputes are resolved by discussion, then by mediation in Uganda |

---

## 15. RISK REGISTER

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | Budget insufficient for the delivered scope | **High** | High | See §16. Resolve before signature |
| K2 | Content not supplied by week 2 | Medium | High | Schedule states this explicitly |
| K3 | Hosting provider price rise | Medium | Medium | Figures confirmed at purchase date |
| K4 | Single decision-maker unavailable | Medium | Medium | Named alternate at kickoff |
| K5 | Staff turnover removes CMS knowledge | Medium | Medium | Recorded training plus written guides |
| K6 | Administrator account compromised | Low | High | Role separation, activity log, two accounts |
| K7 | Device failure loses data | Low | Critical | Nightly off-server backup, restore rehearsed |

---

## 16. BUDGET FEASIBILITY STATEMENT

This section is included because a quotation that hides an unfundable budget
fails the client, not the supplier.

### 16.1 The arithmetic

| Line | Amount (UGX) | Indicative USD |
| --- | --- | --- |
| Total budget ceiling | 500,000 | ~135 |
| Less: first-year hosting, minimum credible plan | (204,000) | (55) |
| **Available for the entire delivery team** | **296,000** | **~80** |

At 296,000 UGX, split across six roles, the delivery budget is roughly
**USD 13 per role for a twelve-week engagement.**

### 16.2 What the delivered work would otherwise cost

The system described in §3 and §4 represents approximately 420 professional
hours: architecture, 60 API routes, 21 administration screens, authentication
and permissions, uploads, search engine work, 204 tests, and full deployment
and backup infrastructure.

| Engagement basis | Rate (USD/hr) | Estimated hours | Indicative cost (UGX) |
| --- | --- | --- | --- |
| Commercial agency | 65 | 420 | ~101,000,000 |
| Regional professional | 25 | 420 | ~39,000,000 |
| Supervised volunteer | 5 | 420 | ~7,700,000 |
| **This proposal's budget** | | | **296,000** |

The budget in this document is **below even the most conservative basis above**,
by a factor of roughly 26.

### 16.3 What 296,000 UGX actually funds

Approximately **six to eight hours** of one senior developer's time. That is
enough to review the existing system, fix the defects listed in §10.1, and hand
it over. It is not enough to verify twenty-one administration screens against real
content, train staff, and support a launch.

### 16.4 Recommended options

Presented in order of realism.

| Option | Budget | What it delivers | Honest consequence |
| --- | --- | --- | --- |
| **A. Partnership** | 500,000 | Hosting for 12 months, code and documentation handover, staff training, 90-day warranty | Team works at cost or sponsored. No market-rate fee is possible |
| **B. Phased over three years** | ~500,000 per year | Year 1 hosting, training, content completion. Years 2 and 3 fund features as revenue allows | Slow, but honest and achievable |
| **C. Hosting and support only** | 500,000 | Server, TLS, backup, monitoring, patching, 6 months support | Cleanest scope for the money |
| **D. Raise the budget** | 8,000,000 minimum | A properly funded team completing §3 in full | Requires a funding route |
| **E. Free-tier hosting** | 296,000 to team | Oracle Always Free tier, subject to availability and foreign-card registration | Frees ~204,000, still insufficient alone |

### 16.5 Recommendation

**Option A**, with the written understanding that the team is engaged on a
partnership or sponsorship basis rather than for payment.

This is the only option where all parties are honest. It delivers a working,
documented, owned system with hosting and training, and it does not pretend that
296,000 UGX is a professional fee for twelve weeks of six-person work.

If payment at market rates is required, the budget must rise to at least
UGX 8,000,000 for regional professional rates, or scope must reduce to Option C.

---

## 17. SIGNATURES

By signing, both parties confirm they have read and understood §16 in particular.

| | Kalisizo Coffee Cooperative | Digital Delivery Team |
| --- | --- | --- |
| **Name** | | |
| **Position** | | |
| **Signature** | | |
| **Date** | | |
| **Contact** | | |

### Document control

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 1 October 2026 | Digital Delivery Team | Initial issue |
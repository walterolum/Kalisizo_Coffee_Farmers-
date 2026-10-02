import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

/**
 * Reads a required environment variable and refuses to continue without one.
 * The admin address and password are never hardcoded, so no credential can
 * reach the source tree or a deployment log by default.
 */
function requireEnv(name: string, hint: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  console.error(`${name} must be set (${hint}). Refusing to continue.`);
  process.exit(1);
}

/**
 * Mirrors `passwordPolicyError` in `src/backend/auth.ts`. Duplicated rather than
 * imported because this file runs under `tsx` outside the Next.js module graph,
 * and pulling in `src/backend/auth` would evaluate its JWT secret resolution.
 */
function passwordPolicyError(password: string): string | null {
  if (password.length < 12) return "at least 12 characters";
  if (password.length > 200) return "200 characters or fewer";
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password)
  ).length;
  if (classes < 3) return "at least three of lowercase, uppercase, numbers, symbols";
  return null;
}

const adminEmail = requireEnv(
  "ADMIN_EMAIL",
  "e.g. `admin@kalisizocoop.coop`"
).toLowerCase();
const adminPassword = requireEnv("ADMIN_PASSWORD", "e.g. `openssl rand -base64 18`");

// Enforcing the policy here is what replaces an explicit denylist of known
// weak passwords: nothing specific has to be named in the source to be blocked.
const policyError = passwordPolicyError(adminPassword);
if (policyError && process.env.NODE_ENV === "production") {
  console.error(
    `ADMIN_PASSWORD is too weak: ${policyError}. Set a strong unique password before seeding production.`
  );
  process.exit(1);
}

/**
 * Inserts `rows` only when the table is empty.
 *
 * The seed is safe to run against a live database: it fills gaps and never
 * removes anything, so re-running it after staff have published content cannot
 * destroy their work. An earlier version deleted every table first, which made
 * `npm run db:seed` — the step the deployment guide tells operators to run on
 * first deploy — a way to wipe the site. Use `npm run db:reset` for a deliberate
 * clean slate.
 */
async function seedIfEmpty<T>(
  label: string,
  delegate: { count(): Promise<number>; createMany(args: unknown): Promise<unknown> },
  rows: T[]
): Promise<void> {
  const existing = await delegate.count();
  if (existing > 0) {
    console.log(`  ${label}: kept ${existing} existing row(s).`);
    return;
  }
  await delegate.createMany({ data: rows });
  console.log(`  ${label}: created ${rows.length}.`);
}

async function main() {
  console.log("Seeding missing records (existing data is never modified)…");

  console.log("Admin user…");
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingAdmin) {
    // Never reset a password here: this script runs on deploy, and silently
    // restoring ADMIN_PASSWORD would undo any reset since it was first seeded.
    console.log(`  ${adminEmail} already exists; left untouched.`);
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);
    await prisma.user.create({
      data: {
        name: "Kalisizo Cooperative Admin",
        email: adminEmail,
        passwordHash,
        role: "SUPER_ADMIN",
      },
    });
    console.log(`  Created ${adminEmail} (do not share the password).`);
  }

  console.log("Leadership…");
  await seedIfEmpty(
    "Leadership members",
    prisma.leadershipMember,
    [
      {
        name: "Muwonge Deo",        title: "Chairman / CEO",
        bio: "Guides the cooperative's strategic direction, upholds governance and champions member welfare.",
        photoUrl: "/leadership/muwonge-deo.jpeg",
        icon: "crown",
        gradient: "from-[#d5a83d] to-[#a87a1d]",
        displayOrder: 1,
      },
      {
        name: "Kanyangira Fred",
        title: "Vice Chairperson",
        bio: "Deputizes the Chairman, supports governance and strengthens member representation across the cooperative.",
        photoUrl: "/leadership/kanyangira-fred.jpeg",
        icon: "crown",
        gradient: "from-[#0e3d28] to-[#1f7345]",
        displayOrder: 2,
      },
      {
        name: "Kasumba Denis Collins",
        title: "Manager",
        bio: "Coordinates daily operations, coffee purchases, quality control and market linkages.",
        photoUrl: "/leadership/kasumba-denis-collins.jpeg",
        icon: "briefcase",
        gradient: "from-[#1f7345] to-[#0e3d28]",
        displayOrder: 3,
      },
      {
        name: "Nakayiki Rose",
        title: "Treasurer",
        bio: "Manages member savings, accounts and SACCO financial reporting with full transparency.",
        photoUrl: "/leadership/nakayiki-rose.jpeg",
        icon: "wallet",
        gradient: "from-[#4a2c11] to-[#6b3f1a]",
        displayOrder: 4,
      },
      {
        name: "Kasule Richard",
        title: "Secretary",
        bio: "Documents meetings, maintains accurate records and supports clear member communication.",
        photoUrl: "/leadership/kasule-richard.jpeg",
        icon: "file",
        gradient: "from-[#1f7345] to-[#2b9757]",
        displayOrder: 5,
      },
      {
        name: "Nanyondo Berna",
        title: "Committee Member",
        bio: "Represents grassroots members, champions women in farming and supports field activities.",
        photoUrl: "/leadership/nanyondo-berna.jpeg",
        icon: "users",
        gradient: "from-[#a87a1d] to-[#d5a83d]",
        displayOrder: 6,
      },
    ]
  );

  console.log("Product / input catalog…");
  await seedIfEmpty(
    "Catalog items",
    prisma.product,
    [
      {
        title: "DAP 18-46-0",
        category: "FERTILIZER_INPUTS",
        badge: "Phosphorus Booster",
        description:
          "Diammonium phosphate for vigorous root development, strong flowering and better fruit set.",
        price: "",
        unit: "50kg bag",
        cta: "Enquire about availability",
        tone: "bg-gradient-to-br from-[#0e3d28] to-[#1f7345]",
        icon: "flask",
        isAvailable: true,
      },
      {
        title: "NPK 17-17-17",
        category: "FERTILIZER_INPUTS",
        badge: "Balanced Blend",
        description:
          "A complete, balanced blend applied at establishment to support healthy overall growth.",
        price: "",
        unit: "50kg bag",
        cta: "Enquire about availability",
        tone: "bg-gradient-to-br from-[#d5a83d] to-[#a87a1d]",
        icon: "sprout",
        isAvailable: true,
      },
      {
        title: "Urea 46% N",
        category: "FERTILIZER_INPUTS",
        badge: "Nitrogen Boost",
        description:
          "High-nitrogen fertiliser to fuel vegetative growth and canopy development after harvest.",
        price: "",
        unit: "50kg bag",
        cta: "Enquire about availability",
        tone: "bg-gradient-to-br from-[#1f7345] to-[#269558]",
        icon: "leaf",
        isAvailable: true,
      },
      {
        title: "Organic Manure",
        category: "FERTILIZER_INPUTS",
        badge: "Soil Guardian",
        description:
          "Composted organic matter that restores soil structure, water retention and microbial life.",
        price: "",
        unit: "100kg bundle",
        cta: "Enquire about availability",
        tone: "bg-gradient-to-br from-[#4a2c11] to-[#6b3f1a]",
        icon: "recycle",
        isAvailable: true,
      },
      {
        title: "Washed Arabica",
        category: "COFFEE_BEANS",
        badge: "Specialty Grade",
        description:
          "High-altitude, carefully washed arabica with refined acidity and a clean cup profile.",
        price: "Request quote",
        unit: "60kg bag",
        cta: "Request sample for wholesale",
        tone: "bg-gradient-to-br from-[#d5a83d] to-[#9c7419]",
        icon: "coffee",
        isAvailable: true,
      },
      {
        title: "Natural Robusta",
        category: "COFFEE_BEANS",
        badge: "Strong Body",
        description:
          "Sun-dried robusta with bold body and chocolate notes, ideal for blends and espresso.",
        price: "Request quote",
        unit: "60kg bag",
        cta: "Request sample for wholesale",
        tone: "bg-gradient-to-br from-[#4a2c11] to-[#2a1508]",
        icon: "coffee",
        isAvailable: true,
      },
      {
        title: "Export-Grade Green",
        category: "COFFEE_BEANS",
        badge: "Bulk Lots",
        description:
          "Verified, moisture-checked green lots sourced transparently from member farms.",
        price: "Request quote",
        unit: "Bulk / container lots",
        cta: "Request export quotation",
        tone: "bg-gradient-to-br from-[#0e3d28] to-[#0f6b40]",
        icon: "wheat",
        isAvailable: true,
      },
      {
        title: "Savings Deposit Account",
        category: "SACCO_PRODUCT",
        badge: "Members Only",
        description:
          "Secure member savings accounts that grow your capital while building financial discipline.",
        price: "",
        unit: "",
        cta: "Open an account",
        icon: "piggybank",
        isAvailable: true,
      },
      {
        title: "Affordable Credit Loans",
        category: "SACCO_PRODUCT",
        badge: "Farm-Cycle Aligned",
        description:
          "Low-interest loans designed around your farming calendar, from inputs to harvest.",
        price: "",
        unit: "",
        cta: "Check loan terms",
        icon: "landmark",
        isAvailable: true,
      },
      {
        title: "Seasonal & Group Loans",
        category: "SACCO_PRODUCT",
        badge: "Flexible Options",
        description:
          "Group-backed and seasonal credit that keeps the cooperative's money working for members.",
        price: "",
        unit: "",
        cta: "Check loan terms",
        icon: "users",
        isAvailable: true,
      },
    ]
  );

  console.log("Store location…");
  if ((await prisma.storeLocation.count()) > 0) {
    console.log("  Main office already present; left untouched.");
  } else {
    await prisma.storeLocation.create({
      data: {
        name: "Kalisizo Coffee Farmers Cooperative Society Ltd, Main Office & Buying Point",
        address: "Kalisizo Town, Kalisizo Sub County, Kyotera District, Uganda",
        district: "Kyotera District",
        subCounty: "Kalisizo Sub County",
        // Verified real location of the cooperative in Kyotera District
        // 0°29'39.8"S 31°37'56.4"E (−0.4943772, 31.6323331) — https://maps.app.goo.gl/f5Q3ezaYKhCCbGSe9
        latitude: -0.4943772,
        longitude: 31.6323331,
        phone: "+256 774 740 871",
        email: "kalisizocoop@gmail.com",
        isMainBranch: true,
      },
    });
    console.log("  Main office created.");
  }

  console.log("Cooperative info…");
  if ((await prisma.cooperativeInfo.count()) > 0) {
    console.log("  Mission, vision and contact details already present; left untouched.");
  } else {
    await prisma.cooperativeInfo.create({
      data: {
        mission:
          "To unite coffee farmers in Kalisizo and beyond into a strong, member-driven cooperative that guarantees fair prices, quality extension support and affordable financing, turning smallholder effort into shared prosperity.",
        vision:
          "A thriving, self-reliant cooperative where every member is treated fairly, incomes grow sustainably and transparency guides every transaction.",
        taglines: [
          "Working Together with Transparency & Respect",
          "Together for Quality, Together for Prosperity!",
        ],
        phoneNumbers: ["0774740871", "0701740871", "0705487223"],
        officialEmail: "kalisizocoop@gmail.com",
        address:
          "Kalisizo Coffee Farmers Cooperative Society Ltd, Kalisizo Town, Kyotera District, Uganda",
      },
    });
    console.log("  Cooperative info created.");
  }

  // Social profiles are CMS-managed rows so they can be edited without a
  // deployment, and so new platforms can be added later.
  console.log("Social links…");
  await seedIfEmpty(
    "Social links",
    prisma.socialLink,
    [
      {
        platform: "YouTube",
        handle: "@muwongedeo2017",
        url: "https://youtube.com/@muwongedeo2017",
        description: "Video stories from the farms and the cooperative.",
        displayOrder: 1,
      },
      {
        platform: "Instagram",
        handle: "@nakafeero",
        url: "https://instagram.com/nakafeero",
        description: "Harvest updates and farmer spotlights.",
        displayOrder: 2,
      },
      {
        platform: "TikTok",
        handle: "@kalisizocoffee",
        url: "https://www.tiktok.com/@kalisizocoffee",
        description: "Short-form updates from the cooperative.",
        displayOrder: 3,
      },
    ]
  );

  console.log("Hero content…");
  if ((await prisma.heroContent.count()) > 0) {
    console.log("  Home page hero already present; left untouched.");
  } else {
    await prisma.heroContent.create({
      data: {
        headlinePrefix: "Empowering Local Farmers through",
        headlineHighlight: "Quality Coffee",
        headlineSuffix: "& Sustainable Agriculture",
        subtitle:
          "Improving member livelihoods through sustainable farming, value addition, and reliable financial services in Kyotera District.",
        badges: [
          "Member Focused",
          "Integrity & Transparency",
          "Sustainable Development",
          "Shared Prosperity",
        ],
        todayItems: [
          {
            icon: "coffee",
            title: "Quality Coffee Collection",
            sub: "Verified lots, openly weighed & graded",
          },
          {
            icon: "sprout",
            title: "Input & Fertilizer Store",
            sub: "DAP, NPK, Urea & organic manure",
          },
          {
            icon: "piggybank",
            title: "SACCO Savings Window",
            sub: "Deposits & affordable member loans",
          },
          {
            icon: "graduationcap",
            title: "Farmers' Training Hub",
            sub: "Good agronomic & climate-smart practice",
          },
        ],
        backgroundImage: "/images/farmers.jpg",
      },
    });
    console.log("  Hero created.");
  }

  console.log("Services…");
  await seedIfEmpty(
    "Services",
    prisma.service,
    [
      {
        title: "Coffee Trade",
        slug: "coffee-trade",
        tagline: "Market linkage & transparent pricing for every member",
        points: [
          "Buying and marketing of quality coffee",
          "Fair and transparent prices",
          "Market linkage for better returns",
        ],
        details: [
          "Coffee harvested, milled and delivered to our central buying point",
          "Green beans weighed, graded and moisture-checked on the spot",
          "Prices quoted openly and payments made on transparent schedules",
          "Domestic and export buyers linked for premium member returns",
        ],
        icon: "coffee",
        accent: "from-[#d5a83d] to-[#a87a1d]",
        ring: "ring-[#d5a83d]/40",
        displayOrder: 1,
        // Stated explicitly: `Service.status` defaults to DRAFT like every other
        // content model, so a service is only live because the seed says so.
        status: "PUBLISHED",
      },
      {
        title: "Production Facility",
        slug: "production-facility",
        tagline: "Quality inputs, soil testing & agronomic advisory",
        points: [
          "Supply of quality inputs & fertilizers",
          "Soil testing & advisory services",
          "Improving productivity and quality",
        ],
        details: [
          "Agri-input store stocked with DAP 18-46-0, NPK 17-17-17, Urea 46% N and organic manure",
          "Soil testing guidance before every growing season",
          "Advisory on fertilizer rates and coffee nutrition",
          "Crop protection, mulching and shade management support",
        ],
        icon: "flask",
        accent: "from-[#1f7345] to-[#0e3d28]",
        ring: "ring-[#1f7345]/40",
        displayOrder: 2,
        status: "PUBLISHED",
      },
      {
        title: "SACCO Services",
        slug: "sacco-services",
        tagline: "Savings, deposits & affordable credit for members",
        points: [
          "Savings and deposit services",
          "Affordable loans",
          "Empowering members financially",
        ],
        details: [
          "Open an affordable member savings account",
          "Low-interest loans aligned with farm income cycles",
          "Safe, audited and transparent record keeping",
          "Group welfare and savings mobilisation drives",
        ],
        icon: "piggybank",
        accent: "from-[#4a2c11] to-[#7a4a1f]",
        ring: "ring-[#6b3f1a]/40",
        displayOrder: 3,
        status: "PUBLISHED",
      },
      {
        title: "Capacity Building & Support",
        slug: "capacity-building-support",
        tagline: "Training, extension & climate-smart farming",
        points: [
          "Training in good agricultural practices",
          "Climate smart farming",
          "Business and financial literacy",
        ],
        details: [
          "Good Agricultural Practices: pruning, mulching, intercropping and careful harvesting",
          "Climate-smart practices: shade trees, water harvesting and agroforestry",
          "Financial literacy and simple farm business records",
          "Farmer group mentorship and guided field visits",
        ],
        icon: "graduationcap",
        accent: "from-[#1f7345] to-[#269558]",
        ring: "ring-[#1f7345]/40",
        displayOrder: 4,
        status: "PUBLISHED",
      },
    ]
  );

  console.log("FAQ items…");
  await seedIfEmpty(
    "FAQ items",
    prisma.faqItem,
    [
      {
        question: "How do I become a member of the cooperative?",
        answer:
          "Membership is open to farmers in and around Kalisizo Sub County, Kyotera District. Visit our office or contact us and the committee will guide you through registration, the modest joining process and the benefits that follow.",
        displayOrder: 1,
      },
      {
        question: "What prices do farmers receive for their coffee?",
        answer:
          "We operate on fair and transparent pricing. Coffee is weighed and graded openly at the buying point, and prices are announced before sale so every member knows exactly what to expect.",
        displayOrder: 2,
      },
      {
        question: "Which fertilizers and inputs are available?",
        answer:
          "Our production facility supplies DAP 18-46-0, NPK 17-17-17, Urea 46% N and organic manure, alongside soil testing and agronomic advisory to help you apply them correctly.",
        displayOrder: 3,
      },
      {
        question: "How does the SACCO savings and loan scheme work?",
        answer:
          "Members open a savings account and build up deposits over time. Pledged savings unlock affordable, farm-cycle-aligned loans. All accounts are recorded transparently and reported to members.",
        displayOrder: 4,
      },
      {
        question: "Do you buy coffee from non-members?",
        answer:
          "We prioritise member produce, but buyers and farmers around the community are welcome to contact us. Joining the cooperative offers the most favourable pricing and support.",
        displayOrder: 5,
      },
      {
        question: "How can coffee buyers place a wholesale order?",
        answer:
          "Wholesale and export buyers can use the inquiry form or contact us directly with the quantity and grade required. We link verified lots and arrange quality documentation for serious buyers.",
        displayOrder: 6,
      },
    ],
  );

  console.log("Success stories…");
  await seedIfEmpty(
    "Success stories",
    prisma.successStory,
    [
      {
        title: "Wages Paid on Time",
        quote: "I received my payment in time for school fees. It was a relief.",
        description:
          "Hundreds of member farmers were paid promptly for their marketable coffee cherries, keeping school fees and household plans on track.",
        metric: "UGX 120M+ paid out",
        displayOrder: 1,
      },
      {
        title: "Inputs Within Reach",
        quote: null,
        description:
          "DAP, NPK and organic manure delivered to the buying point so members could fertilize at the right time and raise next season's yield.",
        metric: "4+ inputs stocked",
        displayOrder: 2,
      },
      {
        title: "Men & Women, Growing Together",
        quote: null,
        description:
          "A growing membership of farmers and farmers' groups works hand-in-hand with the cooperative on quality, transparency and shared prosperity.",
        metric: "Dedicated membership",
        displayOrder: 3,
      },
    ]
  );

  console.log("\nSeed complete ✔");
}

main()
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
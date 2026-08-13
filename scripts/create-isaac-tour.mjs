/**
 * One-shot script: creates the "Production Fix — March 6 2026" release record,
 * generates Isaac's guided tour via Gemini, saves it to the production DB,
 * and outputs the shareable link.
 *
 * Run: DATABASE_URL="..." GEMINI_API_KEY="..." node scripts/create-isaac-tour.mjs
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const RELEASE_TITLE = "Production Fix — March 6 2026";

const RELEASE_CHANGES = [
  {
    id: "c1",
    description: "Database was restored and a missing table was recreated — the app is fully functional again",
    route: "/en/projects",
    category: "bug-fix",
  },
  {
    id: "c2",
    description: "Projects list loads reliably — no more internal server errors on page visit",
    route: "/en/projects",
    category: "fix",
  },
  {
    id: "c3",
    description: "Field Tracker (UPM) is accessible again — you can view, add, and update units and scope rows",
    route: "/en/projects",
    category: "fix",
  },
  {
    id: "c4",
    description: "Unit scope editing works end-to-end — stage, status, and installer fields save correctly",
    route: "/en/projects",
    category: "fix",
  },
];

const tourSchema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      order: { type: SchemaType.NUMBER },
      pageUrl: { type: SchemaType.STRING },
      elementSelector: { type: SchemaType.STRING },
      title: { type: SchemaType.STRING },
      description: { type: SchemaType.STRING },
      voiceText: { type: SchemaType.STRING },
    },
    required: ["order", "pageUrl", "elementSelector", "title", "description", "voiceText"],
  },
};

async function run() {
  // 1. Resolve or create the Release
  let release = await db.release.findFirst({ where: { title: RELEASE_TITLE } });
  if (!release) {
    release = await db.release.create({
      data: {
        title: RELEASE_TITLE,
        branch: "feat/fix-masquerade-log",
        environment: "production",
        mergedAt: new Date("2026-03-06T17:01:14.000Z"),
        prNumber: null,
        changes: RELEASE_CHANGES,
      },
    });
    console.log("✅ Created release:", release.id);
  } else {
    console.log("ℹ️  Release already exists:", release.id);
  }

  // 2. Skip if tour already exists
  const existingTour = await db.releaseTour.findUnique({ where: { releaseId: release.id } });
  if (existingTour) {
    const url = `https://command-center-reboot-production.up.railway.app/en/projects?tour=${release.id}`;
    console.log("\n✅ Tour already exists. Share link for Isaac:\n");
    console.log(url);
    await db.$disconnect();
    return;
  }

  // 3. Generate tour steps with Gemini
  console.log("🤖 Generating tour steps with Gemini...");
  const model = ai.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: tourSchema,
    },
  });

  const prompt = `You are generating a guided product tour for CP Build Command Center — an internal construction project management platform used by a Controls Manager named Isaac.

The platform experienced a brief outage today due to a database issue. It has been fixed and is fully operational. Generate a warm, reassuring 6-step guided tour for Isaac that:
1. Step 1: Opens with a brief, plain-language explanation of what happened and that everything is fixed (no tech jargon — just "we had a brief issue that's now resolved")
2. Steps 2–6: Walk him through his main workflow: Projects list → click into a project → the Field Tracker tab → view and edit a unit scope row

The audience is a non-technical field worker. Keep it friendly, encouraging, and brief.

## Changes in this release (for context)
- Database restored and a missing table was recreated — app is fully functional
- Projects page loads reliably again
- Field Tracker (UPM) shows units and scope data
- Unit scope editing (stage, status, installer) saves correctly

## Known app routes
- /en/projects → selector: '[data-testid="projects-table"], main'

## Instructions
- locale-prefix all pageUrls with "/en", e.g. "/en/projects"
- elementSelector: use '[data-testid="projects-table"]' for the projects page, and 'main' for all others
- Step 1 (welcome/explanation): pageUrl="/en/projects", elementSelector=""
- voiceText: warm, natural spoken narration — as if a friendly Filipino colleague is guiding Isaac. Under 180 characters each.
- description: 1-2 sentences, plain English
- Maximum 6 steps, order starting from 0`;

  const result = await model.generateContent(prompt);
  const steps = JSON.parse(result.response.text());
  console.log(`✅ Generated ${steps.length} steps`);

  // 4. Save tour + steps to DB (array-form $transaction — PgBouncer-safe)
  await db.$transaction([
    db.releaseTour.create({
      data: {
        releaseId: release.id,
        steps: {
          create: steps.map((s, i) => ({
            order: i,
            pageUrl: s.pageUrl,
            elementSelector: s.elementSelector ?? "",
            title: s.title,
            description: s.description,
            voiceText: s.voiceText ?? "",
          })),
        },
      },
    }),
  ]);

  const url = `https://command-center-reboot-production.up.railway.app/en/projects?tour=${release.id}`;

  console.log("\n🎉 Isaac's tour is ready!\n");
  console.log("=== SHARE LINK FOR ISAAC ===");
  console.log(url);
  console.log("\nTour steps:");
  steps.forEach((s, i) => console.log(`  ${i + 1}. [${s.pageUrl}] ${s.title}`));
  console.log("\nSend Isaac this link — when he opens it the tour will start automatically.");

  await db.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});

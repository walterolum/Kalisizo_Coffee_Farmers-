import { NextResponse } from "next/server";
import { readSiteSettings } from "@/backend/site-settings";
import { apiCatch } from "@/shared/api-error";

export async function GET() {
  try {
    const settings = await readSiteSettings();

    if (!settings) {
      return NextResponse.json(
        { error: "not_found", message: "Cooperative settings have not been configured." },
        { status: 404 }
      );
    }

    return NextResponse.json(settings);
  } catch (error) {
    return apiCatch(error, "GET /api/v1/settings");
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

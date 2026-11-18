import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { CardError } from "./board-types";
import { intakeApiKey } from "./config";

export function authorizeIntake(request: Request) {
  const configured = intakeApiKey();
  if (!configured) {
    return NextResponse.json({ error: "INTAKE_API_KEY is not configured." }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : (request.headers.get("x-api-key")?.trim() ?? "");
  const provided = Buffer.from(token);
  const expected = Buffer.from(configured);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function intakeError(error: unknown) {
  if (error instanceof CardError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Intake request failed." }, { status: 500 });
}

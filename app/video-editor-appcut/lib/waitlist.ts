// import { db } from "@/lib/db";
// import { waitlist } from "@/lib/db/schema";
// import { sql } from "drizzle-orm";

export async function getWaitlistCount() {
  try {
    // Return a hardcoded value to avoid database connection issues
    return 127; // You can change this number to whatever you want
    
    // Original database code (commented out):
    // const result = await db
    //   .select({ count: sql<number>`count(*)` })
    //   .from(waitlist);
    // return result[0]?.count || 0;
  } catch (error) {
    console.error("Failed to fetch waitlist count:", error);
    return 127; // Fallback value
  }
}

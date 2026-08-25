import { NextRequest } from "next/server";
import { GET as departmentGet } from "@/app/api/department/issues/route";

export async function GET(request: NextRequest) {
  return departmentGet(request);
}

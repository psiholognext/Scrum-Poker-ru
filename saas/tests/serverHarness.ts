import { PrismaClient } from "@prisma/client";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/saas_test")
  throw new Error("Integration tests require a dedicated /saas_test database");
export const prisma = new PrismaClient({ datasources: { db: { url } } });
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message = "",
  ) {
    super(message);
  }
}

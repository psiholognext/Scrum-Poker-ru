import { defineEnvValidationSchema } from "wasp/env";
import { z } from "zod";
export const clientEnvValidationSchema = defineEnvValidationSchema(
  z.object({
    REACT_APP_STAGE: z
      .enum(["staging", "development", "production"])
      .default("staging"),
  }),
);

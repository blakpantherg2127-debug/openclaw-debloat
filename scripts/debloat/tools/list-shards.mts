// Print the full-suite Vitest shard plan (one JSON object per line), as `pnpm test` would run it.
import { buildFullSuiteVitestRunPlans } from "../../test-projects.test-support.mts";
process.env.OPENCLAW_TEST_PROJECTS_PARALLEL ??= "2";
for (const plan of buildFullSuiteVitestRunPlans([], process.cwd())) {
  console.log(JSON.stringify({ config: plan.config, args: plan.forwardedArgs }));
}

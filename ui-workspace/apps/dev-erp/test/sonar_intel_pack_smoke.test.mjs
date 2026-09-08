// Keep HPP's existing app cwd; static imports carry the optional app's suite.
// Live provider tests are deliberately absent: installed smoke is offline only.
import "../../sonar-intel/test/analysis.test.mjs";
import "../../sonar-intel/test/analysis_server.test.mjs";
import "../../sonar-intel/test/arxiv.test.mjs";
import "../../sonar-intel/test/news_rss.test.mjs";
import "../../sonar-intel/test/papers.test.mjs";
import "../../sonar-intel/test/rate_gate.test.mjs";
import "../../sonar-intel/test/snapshot.test.mjs";
import "../../sonar-intel/test/store.test.mjs";
import "../../sonar-intel/test/runtime_paths.test.mjs";
import "../../sonar-intel/test/data_recovery.test.mjs";

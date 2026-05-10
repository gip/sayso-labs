import overviewMarkdown from "../sayso-overview.md?raw";
import { useSetStatusContext } from "../state/statusContext.js";

export function Spec() {
  useSetStatusContext("/sayso-overview.md");
  return (
    <main className="agent-markdown-page" aria-label="SaySo markdown overview">
      <pre className="agent-markdown-text">{overviewMarkdown}</pre>
    </main>
  );
}

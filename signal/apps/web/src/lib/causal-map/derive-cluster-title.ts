import type { ThesisCluster } from "@/types/causal-graph";

function thesisText(thesis: ThesisCluster["theses"][number]): string {
  return `${thesis.title} ${thesis.statement}`.toLowerCase();
}

function everyThesisMatches(cluster: ThesisCluster, pattern: RegExp): boolean {
  if (cluster.theses.length === 0) return false;
  return cluster.theses.every((t) => pattern.test(thesisText(t)));
}

/** Display title for a cluster — theme from theses, not raw event headline. */
export function deriveClusterTitle(cluster: ThesisCluster): string {
  if (everyThesisMatches(cluster, /\b(war|peace|defense|military|geopolit|missile|ceasefire|strike)\b/)) {
    return "War premium";
  }
  if (everyThesisMatches(cluster, /\b(rate|fed|yield|treasury|policy|cut|hike|ecb|boj)\b/)) {
    return "Rates regime";
  }
  if (everyThesisMatches(cluster, /\b(china|demand|imports|yuan|renminbi)\b/)) {
    return "China demand";
  }

  const event = cluster.event.title.toLowerCase();
  if (event.includes("de-escalation") || event.includes("deescalation")) {
    return "War risk";
  }
  if (event.includes("fed") && (event.includes("pivot") || event.includes("policy"))) {
    return "Rates";
  }
  if (event.includes("china") && event.includes("demand")) {
    return "China demand";
  }

  return cluster.event.title;
}

import { describe, expect, it } from "vitest";
import { buildSourceGroupTree } from "../app/scraper/subscription/index.ts";

describe("source group tree", () => {
  it("builds nested paths with descendant counts and ignores root sources", () => {
    const tree = buildSourceGroupTree([
      { ref: "root", group: [] },
      { ref: "research", group: ["研究"] },
      { ref: "papers", group: ["研究", "论文"] },
      { ref: "datasets", group: ["研究", "数据集"] },
      { ref: "news", group: ["资讯"] },
    ]);

    expect(tree).toEqual([
      {
        name: "研究",
        path: ["研究"],
        sourceCount: 3,
        children: [
          { name: "论文", path: ["研究", "论文"], sourceCount: 1, children: [] },
          { name: "数据集", path: ["研究", "数据集"], sourceCount: 1, children: [] },
        ],
      },
      { name: "资讯", path: ["资讯"], sourceCount: 1, children: [] },
    ]);
  });
});

// Validated teaching examples for the development-only hint preview.
// These examples never provide hints to the production game.
export const hintExampleCopy = {
  xwing: {
    name: "X-Wing（雙列雙行）",
    observe: {
      title: "觀察第 1、9 橫列的候選數 1。",
      description: "這兩個橫列中，哪些空格還能填 1？它們的位置有什麼共同點？",
    },
    reason: {
      title: "兩個橫列的 1，都落在第 6、7 直行。",
      description: [
        "第 1 橫列只有 r1c6、r1c7 能填 1；第 9 橫列只有 r9c6、r9c7 能填 1。",
        "兩個橫列各需要一個 1，而且同一直行不能重複。因此，這兩個 1 必須分別占住第 6、7 直行。",
        "四個藍框格形成 X-Wing。無論最後是哪一組對角格填 1，這兩個直行的其他格都不能再填 1。",
      ],
    },
    conclusion: {
      title: "另外三格可以刪除候選數 1。",
      description: "第 6、7 直行的 1 已被這兩個橫列占住，因此 r3c7、r7c7、r8c6 都不能再填 1。",
      effect: "r3c7、r7c7、r8c6：各刪除候選數 1。",
    },
  },
  pair: {
    name: "顯性數對（Naked Pair）",
    observe: {
      title: "觀察第 3 橫列。",
      description: "有沒有兩格，只剩下相同的兩個候選數？",
    },
    reason: {
      title: "這兩格都只剩下 3、4。",
      description: [
        "r3c5 和 r3c8 的候選數都只有 3、4，而且位於同一橫列。",
        "因此，3 和 4 必須分別填在這兩格，順序尚未確定。",
      ],
    },
    conclusion: {
      title: "r3c6 可以刪除候選數 3、4。",
      description: "第 3 橫列的 3 和 4 必須填在 r3c5、r3c8，因此 r3c6 不能再填 3 或 4。",
      effect: "r3c6：刪除候選數 3、4。",
    },
  },
  hidden: {
    name: "隱性單數（Hidden Single）",
    observe: {
      title: "觀察左上宮的數字 7。",
      description: "找找看，這一宮有哪些空格可能填 7？",
    },
    reason: {
      title: "先排除另外兩個空格。",
      description: [
        "這一宮有 r1c1、r2c3、r3c3 三個空格。",
        "r2c7 已經是 7，所以同一橫列的 r2c3 不能填 7。",
        "r8c3 已經是 7，所以同一直行的 r3c3 不能填 7。",
      ],
    },
    conclusion: {
      title: "r1c1 必須填入 7。",
      description: "左上宮只有 r1c1 能填 7，因此 r1c1 必須填入 7。",
      effect: "r1c1：填入 7。",
    },
  },
};

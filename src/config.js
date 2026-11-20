/* ============================================================
   EDIT ME
   1. Paste your Firebase web config into `firebase` to go live.
      Leave it null and the page runs in DEMO MODE (works across
      tabs of one browser only, handy for rehearsing).
   2. Change the rounds: wording, order, add or remove debates.
      Wrap a word in *asterisks* to set it in the italic accent.
   ============================================================ */
const CONFIG = {
  eventName: 'Timelines to *Advanced AI*',
  org: 'CAMBRIDGE AI SAFETY HUB',

  firebase: {
    apiKey: "AIzaSyBK4D0QkadAzLrpivlBCkckDAlMxg7sUPo",
    databaseURL: "https://caish-social-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "caish-social"
  },
  /* firebase: {
       apiKey: "...",
       databaseURL: "https://YOUR-PROJECT-default-rtdb.europe-west1.firebasedatabase.app",
       projectId: "..."
     }, */

  rounds: [
    { key: 't1', type: 'when', title: 'Opening forecast',
      q: 'When will we get *superintelligence*?' },

    { key: 'd1', type: 'lean', title: 'Debate 1 · Research taste',
      q: 'AI will match top human *research taste* within three years',
      left: 'Not a chance', right: 'It will' },

    { key: 'd2', type: 'lean', title: 'Debate 2 · Diminishing returns',
      q: 'AI improving AI will *snowball*, not stall',
      left: 'It stalls', right: 'It snowballs' },

    { key: 'd3', type: 'lean', title: 'Debate 3 · Generalisation',
      q: 'Benchmark gains will carry over to *messy real-world* work',
      left: 'Goodharted', right: 'It generalises' },

    { key: 't2', type: 'when', title: 'Final forecast', compare: 't1',
      q: 'So, when will we get *superintelligence*?' }
  ],

  emotes: ['🔥', '🤯', '🤔', '👏', '😂', '💀']
};

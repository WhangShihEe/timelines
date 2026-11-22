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
      q: 'When will we get *Top-expert-dominating AI*?',
      sub: 'AI that beats top experts at everything' },

    { key: 'd1', type: 'lean', title: 'Q1 · Speed-up today',
      q: 'Current frontier systems are providing a *2x research speed up*',
      left: 'Disagree', right: 'Agree' },

    { key: 'd2', type: 'lean', title: 'Q2 · Automated researcher',
      q: 'A *fully automated AI researcher* will arrive in the next 2 years',
      left: 'Disagree', right: 'Agree' },

    { key: 'd3', type: 'lean', title: 'Q3 · Feedback loop',
      q: 'Once AI research is fully automated, the *feedback loop* from gain in capability will outpace the increasing difficulty',
      left: 'Disagree', right: 'Agree' },

    { key: 'd4', type: 'lean', title: 'Q4 · Generalisation',
      q: 'Given recursive self improvement is possible, the output would be a *generally capable agent* even on tasks where it has minimal data',
      left: 'Disagree', right: 'Agree' },

    { key: 't2', type: 'when', title: 'Final forecast', compare: 't1',
      q: 'So, when will we get *Top-expert-dominating AI*?',
      sub: 'AI that beats top experts at everything' }
  ],

  emotes: ['🔥', '🤯', '🤔', '👏', '😂', '💀']
};

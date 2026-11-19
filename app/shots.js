(async function() {
  const urlParams = new URLSearchParams(window.location.search);
  const shot = urlParams.get('shot');
  if (!shot) return;

  // Wait for window.__shotReady
  let attempts = 0;
  while (!window.__shotReady && attempts < 50) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }

  if (!window.__trophyGuide) return;
  const guide = window.__trophyGuide;

  if (shot === 'cover') {
    guide.state.earned = [
      'Just Like Paradise',
      'Paradise Lost',
      'Trust',
      'Baited My Tackle',
      'Stick Fiddler',
      'Whip It Good',
      'Treat Yo Self',
      'Master of None',
      'Top Fun',
      'Earn Cash, Not Kudos',
      'Personal Best',
      'The Goodtime State'
    ];
    guide.state.counts = {
      'Cunning Stunts': 120,
      'Whip It Good': 64,
      'You WAiNKer!': 37
    };
    guide.state.spoiler = false;
    guide.state.kindFilter = 'all';

    const pma = guide.state.trophies.find(t => t.name === 'Positive Mental Attitude');
    if (pma) {
      guide.state.selectedTrophyId = pma.id;
    }

    guide.saveProgress();
    guide.renderAll();
  } else if (shot === 'roadmap') {
    if (typeof guide.switchTab === 'function') {
      guide.switchTab('roadmap');
    }
  } else if (shot === 'missables') {
    if (typeof guide.switchTab === 'function') {
      guide.switchTab('missables');
    }
  } else if (shot === 'spoiler') {
    guide.state.spoiler = true;
    guide.state.earned = [];
    guide.saveProgress();
    if (typeof guide.switchTab === 'function') {
      guide.switchTab('checklist');
    }
    guide.renderAll();
  }
})();

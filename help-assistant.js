/* ══════════════════════════════════════════════════════════════════════
   Help Assistant — UI engine
   Rule-based intent matching + UI highlighting. No API calls, no LLM.
   Reads window.HELP_ASSISTANT_KB (populated by help-assistant-kb.js).
   Session-only state — nothing is saved to project JSON.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Guard: only initialise once ─────────────────────────────────── */
  if (document.getElementById('ha-launcher')) return;

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function el(id) { return document.getElementById(id); }
  function qs(sel) { return document.querySelector(sel); }

  /* ── Panel state ─────────────────────────────────────────────────── */
  var panelOpen = false;
  var suggestionsSent = false; /* hide chips after first user query */
  var activeSequenceCancel = null; /* call to cancel running sequence */

  /* ══════════════════════════════════════════════════════════════════
     DOM injection
  ══════════════════════════════════════════════════════════════════ */
  function injectDOM() {
    var kb = window.HELP_ASSISTANT_KB || { suggestions: [], topics: [] };

    /* Launcher */
    var launcher = document.createElement('button');
    launcher.id = 'ha-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Open Help Assistant');
    launcher.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" ' +
      'stroke="#1a2028" stroke-width="2" aria-hidden="true">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      '</svg>' +
      '<span class="ha-launcher-tip">Help Assistant</span>';
    document.body.appendChild(launcher);

    /* Panel */
    var panel = document.createElement('div');
    panel.id = 'ha-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Help Assistant');

    /* Header */
    panel.innerHTML =
      '<div id="ha-header">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
        'stroke="#f3f4f6" stroke-width="2" aria-hidden="true">' +
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
        '</svg>' +
        '<span id="ha-header-title">Help Assistant</span>' +
        '<button id="ha-close" type="button" aria-label="Close Help Assistant">' +
          '&times;' +
        '</button>' +
      '</div>' +
      '<div id="ha-messages"></div>' +
      '<div id="ha-suggestions">' +
        '<div id="ha-suggestions-label">Try asking</div>' +
      '</div>' +
      '<div id="ha-input-row">' +
        '<input id="ha-input" type="text" ' +
          'placeholder="Ask how to do something\u2026" ' +
          'aria-label="Ask the Help Assistant" autocomplete="off">' +
        '<button id="ha-send" type="button">Send</button>' +
      '</div>';
    document.body.appendChild(panel);

    /* Suggestion chips */
    var sugBox = el('ha-suggestions');
    (kb.suggestions || []).forEach(function (text) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ha-chip';
      chip.textContent = text;
      chip.addEventListener('click', function () {
        el('ha-input').value = text;
        sendQuery(text);
      });
      sugBox.appendChild(chip);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     Open / close
  ══════════════════════════════════════════════════════════════════ */
  function openPanel() {
    panelOpen = true;
    el('ha-panel').classList.add('ha-open');
  }

  function closePanel() {
    panelOpen = false;
    el('ha-panel').classList.remove('ha-open');
    if (activeSequenceCancel) { activeSequenceCancel(); activeSequenceCancel = null; }
  }

  /* ══════════════════════════════════════════════════════════════════
     Intent matching
  ══════════════════════════════════════════════════════════════════ */
  var STOPWORDS = [
    'how','do','i','the','a','an','to','is','what','where',
    'does','my','please','can','you','of','for'
  ];

  function matchIntent(query, kb) {
    var q = query.toLowerCase().trim().replace(/[^\w\s]/g, ' ');
    var tokens = q.split(/\s+/).filter(function (t) {
      return t && !STOPWORDS.includes(t);
    });
    /* Only use tokens ≥ 3 chars for per-token/title scoring to avoid
       short words like "as" substring-matching inside "assessment". */
    var scoringTokens = tokens.filter(function (t) { return t.length >= 3; });
    var cleaned = tokens.join(' ');
    if (!cleaned) return null;

    var best = null;
    var bestScore = 2; /* minimum threshold */

    (kb.topics || []).forEach(function (topic) {
      var score = 0;

      /* +3 for each full pattern substring in cleaned query */
      (topic.patterns || []).forEach(function (pat) {
        if (cleaned.includes(pat)) score += 3;
      });

      /* +1 for each scoring token found inside any pattern */
      scoringTokens.forEach(function (tok) {
        if ((topic.patterns || []).some(function (p) { return p.includes(tok); })) {
          score += 1;
        }
      });

      /* +0.5 for scoring tokens in the title */
      var titleLower = (topic.title || '').toLowerCase();
      scoringTokens.forEach(function (tok) {
        if (titleLower.includes(tok)) score += 0.5;
      });

      if (score > bestScore || (score === bestScore && !best)) {
        bestScore = score;
        best = topic;
      }
    });

    return best;
  }

  /* ══════════════════════════════════════════════════════════════════
     Message rendering
  ══════════════════════════════════════════════════════════════════ */
  function scrollMessages() {
    var msgs = el('ha-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  function addUserMessage(text) {
    var wrap = document.createElement('div');
    wrap.className = 'ha-msg ha-msg-user';
    var bubble = document.createElement('div');
    bubble.className = 'ha-bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    el('ha-messages').appendChild(wrap);
    scrollMessages();
  }

  function addAssistantMessage(topic) {
    var kb = window.HELP_ASSISTANT_KB || { topics: [] };
    var wrap = document.createElement('div');
    wrap.className = 'ha-msg ha-msg-assistant';

    var bubble = document.createElement('div');
    bubble.className = 'ha-bubble';
    bubble.innerHTML = topic.answer;
    wrap.appendChild(bubble);

    /* Show me button */
    if (topic.actions && topic.actions.length) {
      var showMeBtn = document.createElement('button');
      showMeBtn.type = 'button';
      showMeBtn.className = 'ha-show-me-btn';
      showMeBtn.textContent = 'Show me';
      showMeBtn.addEventListener('click', function () {
        showMeBtn.disabled = true;
        if (activeSequenceCancel) { activeSequenceCancel(); activeSequenceCancel = null; }
        activeSequenceCancel = runActionSequence(topic.actions, showMeBtn);
      });
      wrap.appendChild(showMeBtn);
    }

    /* Related chips */
    if (topic.related && topic.related.length) {
      var relRow = document.createElement('div');
      relRow.className = 'ha-related-row';

      topic.related.forEach(function (relId) {
        var relTopic = (kb.topics || []).find(function (t) { return t.id === relId; });
        if (!relTopic) return;
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'ha-related-chip';
        chip.textContent = relTopic.title;
        chip.addEventListener('click', function () {
          hideSuggestions();
          addUserMessage(relTopic.title);
          addAssistantMessage(relTopic);
          scrollMessages();
        });
        relRow.appendChild(chip);
      });

      if (relRow.childNodes.length) wrap.appendChild(relRow);
    }

    el('ha-messages').appendChild(wrap);
    scrollMessages();
  }

  function addFallback() {
    var kb = window.HELP_ASSISTANT_KB || { suggestions: [], topics: [] };
    var wrap = document.createElement('div');
    wrap.className = 'ha-msg ha-msg-assistant';

    var bubble = document.createElement('div');
    bubble.className = 'ha-bubble';
    bubble.textContent =
      "I don\u2019t have a guided answer for that yet. " +
      "Try one of the suggested questions, or open the " +
      "Quick Reference (?) panel for more detail.";
    wrap.appendChild(bubble);

    /* Re-render suggestion chips inside the fallback bubble */
    var chipRow = document.createElement('div');
    chipRow.className = 'ha-related-row';
    chipRow.style.marginTop = '6px';

    (kb.suggestions || []).forEach(function (text) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ha-chip';
      chip.textContent = text;
      chip.addEventListener('click', function () {
        el('ha-input').value = text;
        sendQuery(text);
      });
      chipRow.appendChild(chip);
    });

    wrap.appendChild(chipRow);
    el('ha-messages').appendChild(wrap);
    scrollMessages();
  }

  function hideSuggestions() {
    if (!suggestionsSent) {
      suggestionsSent = true;
      var sug = el('ha-suggestions');
      if (sug) sug.style.display = 'none';
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     Send query
  ══════════════════════════════════════════════════════════════════ */
  function sendQuery(text) {
    text = (text || '').trim();
    if (!text) return;
    addUserMessage(text);
    el('ha-input').value = '';
    hideSuggestions();
    var kb = window.HELP_ASSISTANT_KB || { topics: [] };
    var topic = matchIntent(text, kb);
    if (topic) {
      addAssistantMessage(topic);
    } else {
      addFallback();
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     Action sequence runner
     Returns a cancel function.
  ══════════════════════════════════════════════════════════════════ */
  function runActionSequence(actions, triggerBtn) {
    var active = true;
    var i = 0;
    var currentHighlight = null;
    var currentTooltip = null;
    var resizeListener = null;
    var keydownListener = null;
    var outsideClickListener = null;

    function cleanupCurrent() {
      if (currentHighlight) {
        currentHighlight.classList.remove('help-assistant-highlight');
        currentHighlight = null;
      }
      if (currentTooltip) { currentTooltip.remove(); currentTooltip = null; }
      if (resizeListener) {
        window.removeEventListener('resize', resizeListener);
        resizeListener = null;
      }
    }

    function cancel() {
      if (!active) return;
      active = false;
      cleanupCurrent();
      if (keydownListener)
        document.removeEventListener('keydown', keydownListener);
      if (outsideClickListener)
        document.removeEventListener('click', outsideClickListener, true);
      if (triggerBtn) triggerBtn.disabled = false;
      activeSequenceCancel = null;
    }

    keydownListener = function (e) {
      if (e.key === 'Escape') cancel();
    };
    document.addEventListener('keydown', keydownListener);

    /* Delay outside-click listener so the triggering click doesn't fire it */
    setTimeout(function () {
      if (!active) return;
      outsideClickListener = function (e) {
        if (!currentTooltip) return;
        if (currentTooltip.contains(e.target)) return;
        if (currentHighlight && currentHighlight.contains(e.target)) return;
        cancel();
      };
      document.addEventListener('click', outsideClickListener, true);
    }, 80);

    function next() {
      cleanupCurrent();
      if (!active) return;
      if (i >= actions.length) { cancel(); return; }
      var action = actions[i++];
      var isLast = (i >= actions.length);

      if (action.type === 'open-panel') {
        var panelEl = qs(action.selector);
        if (panelEl) {
          panelEl.click();
          setTimeout(next, 240); /* wait for panel expand animation */
        } else {
          console.warn('[HelpAssistant] Selector not found:', action.selector);
          next();
        }
        return;
      }

      if (action.type === 'highlight') {
        var targetEl = qs(action.selector);
        if (!targetEl) {
          console.warn('[HelpAssistant] Selector not found:', action.selector);
          next();
          return;
        }
        if (action.scrollIntoView) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        targetEl.classList.add('help-assistant-highlight');
        currentHighlight = targetEl;
        showStepTooltip(targetEl, action.label, isLast, next);
        return;
      }

      if (action.type === 'tip') {
        showToastTip(action.label, isLast, next);
        return;
      }

      /* Unknown type — skip */
      next();
    }

    /* ── Step tooltip (anchored to element) ──────────────────────── */
    function showStepTooltip(anchorEl, label, isLast, onNext) {
      var tooltip = document.createElement('div');
      tooltip.className = 'ha-step-tooltip';
      tooltip.innerHTML =
        '<span class="ha-step-label">' + escapeHTML(label) + '</span>' +
        '<button class="ha-step-btn" type="button">' +
          (isLast ? 'Done' : 'Next') +
        '</button>';
      tooltip.style.visibility = 'hidden';
      document.body.appendChild(tooltip);
      currentTooltip = tooltip;

      function position() {
        if (!currentTooltip) return;
        var rect = anchorEl.getBoundingClientRect();
        var th = tooltip.offsetHeight;
        var tw = tooltip.offsetWidth;
        var placeBelow = (rect.bottom + th + 16) <= window.innerHeight;
        var top, leftVal;
        tooltip.classList.remove('ha-caret-above', 'ha-caret-below');
        if (placeBelow) {
          top = rect.bottom + 8;
          tooltip.classList.add('ha-caret-above');
        } else {
          top = rect.top - th - 8;
          tooltip.classList.add('ha-caret-below');
        }
        leftVal = Math.max(8, Math.min(rect.left, window.innerWidth - tw - 8));
        tooltip.style.top = top + 'px';
        tooltip.style.left = leftVal + 'px';
        tooltip.style.visibility = 'visible';
      }

      /* Position after a paint to get accurate dimensions */
      requestAnimationFrame(position);

      resizeListener = position;
      window.addEventListener('resize', resizeListener);

      tooltip.querySelector('.ha-step-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        onNext();
      });
    }

    /* ── Toast tip (centred, no anchor element) ───────────────────── */
    function showToastTip(label, isLast, onNext) {
      var toast = document.createElement('div');
      toast.className = 'ha-toast-tip';
      toast.innerHTML =
        '<span class="ha-step-label">' + escapeHTML(label) + '</span>' +
        '<button class="ha-step-btn" type="button">' +
          (isLast ? 'Done' : 'Next') +
        '</button>';
      document.body.appendChild(toast);
      currentTooltip = toast;

      toast.querySelector('.ha-step-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        onNext();
      });
    }

    next();
    return cancel;
  }

  /* ── HTML escape helper ───────────────────────────────────────── */
  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ══════════════════════════════════════════════════════════════════
     Event wiring
  ══════════════════════════════════════════════════════════════════ */
  function wireEvents() {
    /* Launcher toggle */
    el('ha-launcher').addEventListener('click', function () {
      if (panelOpen) { closePanel(); } else { openPanel(); }
    });

    /* Close button */
    el('ha-close').addEventListener('click', closePanel);

    /* Send button */
    el('ha-send').addEventListener('click', function () {
      sendQuery(el('ha-input').value);
    });

    /* Enter key in input */
    el('ha-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); sendQuery(el('ha-input').value); }
    });

    /* Global Escape handler */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (activeSequenceCancel) {
        activeSequenceCancel();
        activeSequenceCancel = null;
      } else if (panelOpen) {
        closePanel();
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     Initialise on DOMContentLoaded
  ══════════════════════════════════════════════════════════════════ */
  function init() {
    if (document.getElementById('ha-launcher')) return; /* already done */
    injectDOM();
    wireEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

    Flowey.readerLayout = (function () {
      var html = document.documentElement;
      var body = document.body;
      var shell = document.querySelector('.container');
      var diagram = document.querySelector('.diagram-container');
      var svg = diagram && diagram.querySelector(':scope > svg');
      var header = shell && shell.querySelector('.header');
      var cards = shell && shell.querySelector('.cards');
      var viewBox = svg && svg.viewBox && svg.viewBox.baseVal;
      var ratio = viewBox && viewBox.height > 0 ? viewBox.width / viewBox.height : 0;
      var measuredHeightFit = svg && svg.getAttribute('data-reader-fit') === 'intrinsic-height';
      var frame = 0;
      var settleFrame = 0;
      var lastWidth = 0;
      // Widest reader the overflow settle has accepted for this viewport (0 =
      // uncapped). Card copy rewraps as the reader narrows, so recomputing
      // from fixed heights alone would widen again and oscillate; only a
      // resize lifts the cap.
      var settledCap = 0;
      // Previous settle pass overflow; null means no baseline yet. Reset
      // alongside settledCap whenever the width state is discarded, so a new
      // layout cycle re-learns convergence from scratch.
      var settlePrevOverflow = null;
      var WIDE_RATIO = 1.55;
      // Never reflow the whole canvas to chase a residual scroll smaller
      // than this: below it the page scrolls as authored and readability is
      // preserved. Only a material overflow (a genuinely taller-than-viewport
      // diagram) is worth shrinking for.
      var SHRINK_OVERFLOW_MIN_PX = 96;
      var MIN_DESKTOP_WIDTH = 1024;
      var MIN_READER_WIDTH = 960;
      var MAX_READER_WIDTH = 1920;
      var MIN_PROJECTED_NODE_TEXT_PX = 6;
      var declaredMinimumText = svg ? parseFloat(svg.getAttribute('data-reader-min-text') || '') : null;
      var requestedMinimumText = Number.isFinite(declaredMinimumText)
        ? Math.max(MIN_PROJECTED_NODE_TEXT_PX, declaredMinimumText)
        : MIN_PROJECTED_NODE_TEXT_PX;
      var declaredPrimaryText = svg ? parseFloat(svg.getAttribute('data-reader-primary-text') || '') : null;
      var SAFE_BOTTOM_GAP = 12;
      // Sidebar shell: notes, node details, and the node index dock on the
      // left and the dotted canvas reflows to the remaining width. The rail
      // never overlaps the canvas and never stacks below it.
      var RAIL_WIDTH = 288;
      var RAIL_GAP = 20;
      var railPanel = shell && shell.querySelector('.reader-rail');
      var railReveal = document.getElementById('rail-reveal');
      var railCollapse = document.getElementById('rail-collapse');
      var railPlacement = document.getElementById('rail-placement');
      var focusPanel = document.getElementById('focus-chip');
      var RAIL_COLLAPSED_KEY = 'flowey-rail-collapsed-v2';
      var RAIL_PLACEMENT_KEY = 'flowey-rail-placement';
      // Memory is the page's source of truth; storage only carries the choice
      // to later artifacts, so a blocked or full localStorage cannot freeze it.
      var preferences = Object.create(null);
      function readPreference(key) {
        if (key in preferences) return preferences[key];
        try { return localStorage.getItem(key); } catch (_) { return null; }
      }
      function writePreference(key, value) {
        preferences[key] = value;
        try { localStorage.setItem(key, value); } catch (_) {}
      }

      if (diagram && ratio >= WIDE_RATIO) {
        diagram.setAttribute('data-wide-diagram', 'true');
        html.setAttribute('data-diagram-shape', 'wide');
      }

      function number(value) {
        var parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      function visible(element) {
        return Boolean(element && !element.hidden && window.getComputedStyle(element).display !== 'none');
      }
      function outerHeight(element) {
        if (!visible(element)) return 0;
        var style = window.getComputedStyle(element);
        return element.getBoundingClientRect().height + number(style.marginTop) + number(style.marginBottom);
      }
      // Smallest scale that keeps node text at the requested floor and
      // context relationship labels readable. A declared wide reader holds
      // relationship labels to the requested floor too; every other reader
      // still keeps them at the 6px hard floor the browser gate enforces, so
      // a first-screen fit can never push them below it.
      function minimumReadableScale() {
        var nodeMinimum = null;
        var edgeMinimum = null;
        var selectors = 'text[data-node-label], text[data-boundary-label], text[data-detail="context"], g[data-detail="context"] text';
        Array.from(svg.querySelectorAll(selectors)).forEach(function (text) {
          if (text.getAttribute('data-detail') === 'fine' || text.closest('[data-detail="fine"]')) return;
          var sourceFontPx = parseFloat(text.getAttribute('font-size') || '');
          if (!Number.isFinite(sourceFontPx)) return;
          var primary = text.hasAttribute('data-node-label') || text.hasAttribute('data-boundary-label');
          var context = text.getAttribute('data-detail') === 'context' || Boolean(text.closest('g[data-detail="context"]'));
          if (!primary && context && text.closest('[data-edge-from][data-edge-to]')) {
            edgeMinimum = edgeMinimum == null ? sourceFontPx : Math.min(edgeMinimum, sourceFontPx);
          } else if (primary || text.closest('[data-node-id]')) {
            nodeMinimum = nodeMinimum == null ? sourceFontPx : Math.min(nodeMinimum, sourceFontPx);
          }
        });
        var edgeTarget = measuredHeightFit && ratio >= WIDE_RATIO && Number.isFinite(declaredMinimumText)
          ? requestedMinimumText
          : MIN_PROJECTED_NODE_TEXT_PX;
        var scale = 0;
        if (nodeMinimum != null) scale = Math.max(scale, requestedMinimumText / nodeMinimum);
        if (edgeMinimum != null) scale = Math.max(scale, edgeTarget / edgeMinimum);
        return scale > 0 ? Math.min(1, scale) : 1;
      }
      var sourcePrimary = null;
      if (svg) Array.from(svg.querySelectorAll('text[data-node-label]')).forEach(function (text) {
        var size = parseFloat(text.getAttribute('font-size') || '');
        if (Number.isFinite(size) && size > 0) sourcePrimary = sourcePrimary == null ? size : Math.max(sourcePrimary, size);
      });
      // SVG width at which the largest node label renders at targetPx. Every
      // renderer writes label font sizes, so the width floor works for all
      // diagram types; only the renderer-declared floor needs metadata.
      function labelWidth(targetPx) {
        return sourcePrimary == null || !viewBox ? 0 : viewBox.width * targetPx / sourcePrimary;
      }
      function primaryReadingWidth() {
        if (!measuredHeightFit || !Number.isFinite(declaredPrimaryText) || declaredPrimaryText <= 0) return 0;
        // Primary labels should remain comfortable to read when auxiliary rows
        // make a one-screen fit too small. Ordinary page scroll preserves that
        // reading size; viewport width still caps it. A long title may already
        // use a smaller fitted font. Preserve that hierarchy rather than
        // enlarging every other node to compensate.
        return labelWidth(declaredPrimaryText);
      }
      function viewerModesBlocked() {
        return html.getAttribute('data-embed') === 'true' ||
          html.getAttribute('data-present') === 'true' ||
          (window.matchMedia && window.matchMedia('print').matches);
      }
      // Sidebar availability never depends on viewport width or diagram ratio:
      // whenever there is panel content the collapsed rail (and its reveal
      // control) exists, so nothing ever renders below the canvas.
      function railEligible() {
        return Boolean(shell && diagram && svg && railPanel && !viewerModesBlocked());
      }
      function eligible() {
        return Boolean(
          shell && diagram && svg && (ratio >= WIDE_RATIO || measuredHeightFit) &&
          window.innerWidth >= MIN_DESKTOP_WIDTH &&
          html.getAttribute('data-embed') !== 'true' &&
          html.getAttribute('data-present') !== 'true' &&
          (!window.matchMedia || !window.matchMedia('print').matches)
        );
      }
      function clear() {
        html.style.removeProperty('--flowey-reader-width');
        html.style.removeProperty('--flowey-diagram-max-width');
        if (diagram) diagram.style.removeProperty('min-height');
        html.removeAttribute('data-reader-narrow');
        html.removeAttribute('data-reader-layout');
        html.removeAttribute('data-reader-overflow');
        setRail(false);
        lastWidth = 0;
        settledCap = 0;
        settlePrevOverflow = null;
      }
      // Rail modes: "true" docks the sidebar on the left and the canvas
      // reflows to the remaining width; "collapsed" leaves only the
      // "Notes & index" reveal control in the canvas corner. There is no
      // overlay drawer and no below-canvas row: the sidebar never overlaps
      // the canvas.
      function setRail(mode) {
        if (mode) {
          html.setAttribute('data-reader-rail', mode);
          html.style.setProperty('--flowey-rail-width', RAIL_WIDTH + 'px');
          html.style.setProperty('--flowey-rail-gap', RAIL_GAP + 'px');
        } else {
          html.removeAttribute('data-reader-rail');
          html.style.removeProperty('--flowey-rail-width');
          html.style.removeProperty('--flowey-rail-gap');
        }
        if (railReveal) {
          railReveal.hidden = mode !== 'collapsed';
          railReveal.setAttribute('aria-expanded', String(mode === 'true'));
        }
        if (railCollapse) {
          railCollapse.hidden = mode !== 'true';
          railCollapse.setAttribute('aria-expanded', String(mode === 'true'));
        }
        // The placement toggle is retired: the sidebar always docks on the
        // left. The element stays in the DOM (hidden) so its id contract
        // never breaks for older artifacts or assistive tech.
        if (railPlacement) {
          railPlacement.hidden = true;
          railPlacement.setAttribute('data-placement', 'left');
        }
      }
      var outline = document.getElementById('node-outline');
      function hasCards() {
        return Boolean((cards && cards.children.length && !cards.hidden) || (outline && !outline.hidden));
      }
      function hasPanelContent() {
        return Boolean(hasCards() || (focusPanel && !focusPanel.hidden));
      }
      // Nothing renders below the fold: notes, node details, and the index
      // live inside the left sidebar, so the first screen belongs to the
      // interactive diagram and its controls.
      function belowFold() {
        return 0;
      }
      // A docked rail may run past a short diagram down to the viewport floor,
      // so the index uses that space instead of scrolling inside the diagram's
      // height; it never pushes the page into overflow.
      function fitDockedRail() {
        if (html.getAttribute('data-reader-rail') !== 'true' || !railPanel) return;
        var top = railPanel.getBoundingClientRect().top + window.scrollY;
        var floor = window.innerHeight - number(window.getComputedStyle(body).paddingBottom) - top;
        html.style.setProperty('--flowey-rail-max', Math.max(diagram.getBoundingClientRect().height, floor) + 'px');
      }
      function chromeMetrics() {
        var bodyStyle = window.getComputedStyle(body);
        var diagramStyle = window.getComputedStyle(diagram);
        return {
          bodyX: number(bodyStyle.paddingLeft) + number(bodyStyle.paddingRight),
          bodyY: number(bodyStyle.paddingTop) + number(bodyStyle.paddingBottom),
          diagramX: number(diagramStyle.paddingLeft) + number(diagramStyle.paddingRight) +
            number(diagramStyle.borderLeftWidth) + number(diagramStyle.borderRightWidth),
          diagramY: number(diagramStyle.paddingTop) + number(diagramStyle.paddingBottom) +
            number(diagramStyle.borderTopWidth) + number(diagramStyle.borderBottomWidth)
        };
      }
      // `width` is the diagram's reading width. The page shell never narrows
      // below the desktop reader floor, so a narrow, tall diagram keeps a
      // usable header, toolbar, and controls; its SVG is centred instead.
      function applyWidth(width, minWidth) {
        var rounded = Math.max(Math.ceil(minWidth || 0), Math.round(width));
        if (Math.abs(rounded - lastWidth) < 1) return false;
        lastWidth = rounded;
        var shellFloor = Math.min(MIN_READER_WIDTH, Math.max(0, window.innerWidth - chromeMetrics().bodyX));
        html.style.setProperty('--flowey-reader-width', Math.max(rounded, shellFloor) + 'px');
        if (rounded < shellFloor) {
          // `rounded` already includes the docked left rail and its gap; the
          // SVG cap is only the diagram's share, not the space beside it.
          var railShare = html.getAttribute('data-reader-rail') === 'true' ? RAIL_WIDTH + RAIL_GAP : 0;
          html.style.setProperty('--flowey-diagram-max-width', Math.max(1, rounded - railShare - chromeMetrics().diagramX) + 'px');
          html.setAttribute('data-reader-narrow', 'true');
        } else {
          html.style.removeProperty('--flowey-diagram-max-width');
          html.removeAttribute('data-reader-narrow');
        }
        html.setAttribute('data-reader-layout', 'adaptive');
        return true;
      }
      function settleOverflow(minWidth) {
        if (settleFrame) cancelAnimationFrame(settleFrame);
        settleFrame = requestAnimationFrame(function () {
          settleFrame = 0;
          if (!eligible() || !lastWidth) return;
          fitDockedRail();
          var overflow = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight
          ) - window.innerHeight - belowFold();
          // A shrink step that does not reduce the overflow is chasing fixed
          // chrome or non-responsive content: hold the width instead of
          // ratcheting down to the floor. Tracked across frames so genuine
          // slow convergence still proceeds while a plateau stops it.
          // Separately, never reflow the whole canvas to chase a residual
          // scroll smaller than SHRINK_OVERFLOW_MIN_PX: below that the page
          // scrolls as authored and readability is preserved. Only a
          // material overflow (a genuinely taller-than-viewport diagram)
          // is worth shrinking for. The overflow must also persist across
          // two consecutive passes so single-frame transients (fonts,
          // theme toggles) never ratchet the width down.
          var improving = settlePrevOverflow === null || overflow < settlePrevOverflow - 1;
          var persistent = settlePrevOverflow !== null && settlePrevOverflow > SHRINK_OVERFLOW_MIN_PX;
          settlePrevOverflow = overflow;
          if (overflow > SHRINK_OVERFLOW_MIN_PX && persistent && lastWidth > Math.ceil(minWidth) && improving) {
            applyWidth(Math.max(minWidth, lastWidth - overflow * ratio - 4), minWidth);
            settledCap = lastWidth;
            html.setAttribute('data-reader-overflow', 'reduced');
          } else if (overflow > 1) {
            html.setAttribute('data-reader-overflow', 'authored');
          } else {
            html.removeAttribute('data-reader-overflow');
          }
        });
      }
      function railMode() {
        if (!railEligible() || !hasPanelContent()) return false;
        // Collapsed by default: only the reveal control is visible. An
        // explicit open ('0') docks the sidebar on the left and reflows the
        // canvas; it never overlays and never stacks below.
        if (readPreference(RAIL_COLLAPSED_KEY) === '0') return 'true';
        return 'collapsed';
      }
      function measure() {
        frame = 0;
        var mode = railMode();
        if (!eligible()) {
          // Adaptive width is desktop-only, but the sidebar shell still
          // applies on every viewport so cards never fall below the canvas.
          html.style.removeProperty('--flowey-reader-width');
          html.style.removeProperty('--flowey-diagram-max-width');
          if (diagram) diagram.style.removeProperty('min-height');
          html.removeAttribute('data-reader-narrow');
          html.removeAttribute('data-reader-layout');
          html.removeAttribute('data-reader-overflow');
          setRail(mode);
          lastWidth = 0;
          settledCap = 0;
          settlePrevOverflow = null;
          if (mode === 'true') fitDockedRail();
          return null;
        }
        var chrome = chromeMetrics();
        // The dotted canvas takes up to 95% of the viewport in both axes so
        // the page never scrolls: readers get maximum diagram, minimum chrome.
        var viewportCap = Math.min(
          Math.max(0, window.innerWidth - chrome.bodyX),
          Math.floor(window.innerWidth * 0.95)
        );
        var readableWidth = viewBox && viewBox.width > 0
          ? viewBox.width * minimumReadableScale() + chrome.diagramX
          : MIN_READER_WIDTH;
        var maxWidth = Math.min(MAX_READER_WIDTH, viewportCap);
        var readableMinimumWidth = measuredHeightFit && ratio < WIDE_RATIO
          ? readableWidth
          : measuredHeightFit && ratio >= WIDE_RATIO && Number.isFinite(declaredMinimumText)
            ? Math.max(MIN_READER_WIDTH, readableWidth)
            : MIN_READER_WIDTH;
        var minWidth;
        if (measuredHeightFit && ratio < WIDE_RATIO) {
          minWidth = Math.min(readableMinimumWidth, viewportCap);
        } else if (measuredHeightFit && ratio >= WIDE_RATIO && Number.isFinite(declaredMinimumText)) {
          minWidth = Math.min(readableMinimumWidth, maxWidth);
        } else {
          minWidth = Math.min(readableMinimumWidth, viewportCap);
        }
        var primaryWidth = primaryReadingWidth();
        var railExtra = RAIL_WIDTH + RAIL_GAP;
        // Fit beats comfort: the floor is text readability, not the comfort
        // size, so diagrams shrink to the viewport instead of scrolling.
        // Only a docked rail (which consumes width beside the canvas)
        // enforces the comfort floor.
        if (mode !== 'true') primaryWidth = 0;
        if (primaryWidth > 0) minWidth = Math.max(minWidth, Math.min(maxWidth, primaryWidth + chrome.diagramX));
        var docked = mode === 'true';
        setRail(mode);
        chrome = chromeMetrics();
        if (docked) minWidth = Math.min(maxWidth, minWidth + railExtra);
        var fixedHeight = chrome.bodyY + chrome.diagramY + SAFE_BOTTOM_GAP +
          outerHeight(header);
        var availableSvgHeight = Math.max(1, Math.floor(window.innerHeight * 0.95) - fixedHeight);
        var desiredWidth = availableSvgHeight * ratio + chrome.diagramX + (docked ? railExtra : 0);
        var width = Math.max(minWidth, Math.min(maxWidth, desiredWidth, settledCap || desiredWidth));
        try { window.__wlog.push({ w: Math.round(width), min: Math.round(minWidth), max: Math.round(maxWidth), des: Math.round(desiredWidth), cap: settledCap, availH: Math.round(availableSvgHeight), fixH: Math.round(fixedHeight) }); } catch (_) {}
        applyWidth(width, minWidth);
        // Fill the viewport vertically: the dotted canvas takes the available
        // height so no dead page shows below a short diagram. Capped at the
        // viewport, so the page still never scrolls.
        var containerTop = diagram.getBoundingClientRect().top;
        var fillHeight = Math.max(0, window.innerHeight - containerTop - SAFE_BOTTOM_GAP);
        diagram.style.minHeight = Math.ceil(fillHeight) + 'px';
        // Trim sub-viewport overshoot from below-fold margins (e.g. the cards
        // slot's top margin leaks even when cards live in the rail), so the
        // page never scrolls. Bounded: genuinely taller content is left as
        // authored instead of grinding the canvas down.
        var fillExcess = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight
        ) - window.innerHeight;
        if (fillExcess > 0 && fillExcess <= 64) {
          diagram.style.minHeight = Math.max(0, Math.ceil(fillHeight - fillExcess)) + 'px';
        }
        settleOverflow(minWidth);
        return {
          ratio: ratio,
          width: lastWidth,
          availableSvgHeight: Math.round(availableSvgHeight),
          fixedHeight: Math.round(fixedHeight)
        };
      }
      function schedule() {
        if (frame) return;
        frame = requestAnimationFrame(measure);
      }
      function stableSnapshot() {
        var shellRect = shell ? shell.getBoundingClientRect() : { width: 0, height: 0 };
        var diagramRect = diagram ? diagram.getBoundingClientRect() : { width: 0, height: 0 };
        return [
          lastWidth,
          html.getAttribute('data-reader-layout') || '',
          html.getAttribute('data-reader-rail') || '',
          html.getAttribute('data-reader-overflow') || '',
          Math.ceil(document.documentElement.scrollWidth),
          Math.ceil(document.documentElement.scrollHeight),
          Math.ceil(document.body.scrollWidth),
          Math.ceil(document.body.scrollHeight),
          Math.round(shellRect.width * 100) / 100,
          Math.round(shellRect.height * 100) / 100,
          Math.round(diagramRect.width * 100) / 100,
          Math.round(diagramRect.height * 100) / 100
        ].join('|');
      }
      function layoutPending() { return Boolean(frame || settleFrame); }
      function whenStable() {
        return Flowey.waitForStableLayout({
          schedule: schedule,
          pending: layoutPending,
          snapshot: stableSnapshot,
          timeoutMessage: 'Adaptive reader layout did not reach stable dimensions.'
        });
      }
      floweyLayoutOwners.reader = { schedule: schedule, pending: layoutPending, snapshot: stableSnapshot };

      window.addEventListener('resize', function () {
        settledCap = 0;
        settlePrevOverflow = null;
        schedule();
      }, { passive: true });
      window.addEventListener('load', schedule, { once: true });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule).catch(function () {});
      if (typeof ResizeObserver === 'function') {
        var resizeObserver = new ResizeObserver(schedule);
        [header, cards].forEach(function (element) { if (element) resizeObserver.observe(element); });
      }
      if (typeof MutationObserver === 'function') {
        var contentObserver = new MutationObserver(schedule);
        if (cards) contentObserver.observe(cards, { attributes: true, childList: true, subtree: true });
        if (focusPanel) contentObserver.observe(focusPanel, { attributes: true, attributeFilter: ['hidden'] });
        contentObserver.observe(html, { attributes: true, attributeFilter: ['data-embed', 'data-present'] });
      }
      // Reader choices persist across artifacts; a resize-style remeasure
      // applies them without reloading.
      function chooseRail(key, value) {
        writePreference(key, value);
        settledCap = 0;
        settlePrevOverflow = null;
        schedule();
      }
      function collapseRail() {
        chooseRail(RAIL_COLLAPSED_KEY, '1');
        if (railReveal) requestAnimationFrame(function () { try { railReveal.focus({ preventScroll: true }); } catch (_) {} });
      }
      function openRail() {
        chooseRail(RAIL_COLLAPSED_KEY, '0');
      }
      if (railReveal) railReveal.addEventListener('click', function () { chooseRail(RAIL_COLLAPSED_KEY, '0'); });
      if (railCollapse) railCollapse.addEventListener('click', collapseRail);
      if (typeof ResizeObserver === 'function' && railPanel) new ResizeObserver(schedule).observe(railPanel);
      schedule();

      return {
        measure: measure,
        schedule: schedule,
        whenStable: whenStable,
        openRail: openRail,
        collapseRail: collapseRail,
        active: function () { return html.getAttribute('data-reader-layout') === 'adaptive'; },
        receipt: function () { return { ratio: ratio, width: lastWidth }; }
      };
    })();

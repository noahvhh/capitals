/*
 * Generic renderers for deck fields. A field spec is one of:
 *   { type: 'text',  field, sub?, note? }   text in the serif display face
 *   { type: 'flag',  field, label? }        emoji flag from an ISO code
 *   { type: 'map',   field, groupField? }   locator map from an ISO code
 *   { type: 'image', field, alt? }          image URL stored on the item
 * The quiz screen only calls these, so any deck built from them works with
 * no UI changes.
 */
(function (root) {
  var CA = root.CA = root.CA || {};

  function text(spec, item, role) {
    var el = document.createElement('div');
    el.className = 'qt qt-' + role;
    var main = document.createElement(role === 'prompt' ? 'h2' : 'p');
    main.className = 'qt-main display';
    main.textContent = item[spec.field];
    el.appendChild(main);
    if (spec.sub && item[spec.sub]) {
      var sub = document.createElement('p');
      sub.className = 'qt-sub';
      sub.textContent = 'also ' + item[spec.sub];
      el.appendChild(sub);
    }
    if (spec.note && item[spec.note]) {
      var note = document.createElement('p');
      note.className = 'qt-note';
      note.textContent = item[spec.note];
      el.appendChild(note);
    }
    return el;
  }

  function image(spec, item) {
    var img = document.createElement('img');
    img.className = 'q-image';
    img.src = item[spec.field];
    img.alt = spec.alt ? item[spec.alt] || '' : '';
    img.decoding = 'async';
    return img;
  }

  function flagLabel(spec, item) {
    return spec.label ? item[spec.label] : '';
  }

  // Elements that are rebuilt for every question (cross-faded).
  function element(spec, item, role, deck) {
    switch (spec.type) {
      case 'text': return text(spec, item, role);
      case 'flag': return CA.flag.render(item[spec.field], role === 'media' ? flagLabel(spec, item) : '');
      case 'image': return image(spec, item);
      case 'map': {
        // A map used as a prompt or answer gets its own instance.
        var holder = document.createElement('div');
        holder.className = 'q-map-inline';
        var m = CA.map.create(holder);
        m.show(item[spec.field], item[spec.groupField], groupLabel(deck, item[spec.groupField]));
        return holder;
      }
    }
    var fallback = document.createElement('p');
    fallback.textContent = String(item[spec.field] || '');
    return fallback;
  }

  function groupLabel(deck, id) {
    var g = (deck.groups || []).find(function (x) { return x.id === id; });
    return g ? g.label : '';
  }

  // Swap the content of a slot with a cross-fade.
  function swap(slot, el) {
    var old = slot.querySelectorAll('.swap-item:not(.leaving)');
    old.forEach(function (o) {
      o.classList.add('leaving');
      o.setAttribute('aria-hidden', 'true');
      setTimeout(function () { o.remove(); }, 700);
    });
    if (!el) return;
    el.classList.add('swap-item', 'entering');
    slot.appendChild(el);
    // Force a frame so the transition runs.
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.remove('entering'); }); });
  }

  /*
   * Persistent media slot: the map stays put and glides to the next
   * country; other media cross-fade.
   */
  function mediaSlot(spec, deck) {
    var slot = document.createElement('div');
    slot.className = 'q-slot q-slot-' + spec.type;
    var map = spec.type === 'map' ? CA.map.create(slot) : null;
    return {
      el: slot,
      update: function (item, visible) {
        if (map) {
          if (visible) map.show(item[spec.field], item[spec.groupField], groupLabel(deck, item[spec.groupField]));
          else map.clear();
          return;
        }
        if (visible) swap(slot, element(spec, item, 'media', deck));
        else {
          var ph = document.createElement('div');
          ph.className = 'q-placeholder q-placeholder-' + spec.type;
          ph.setAttribute('aria-hidden', 'true');
          swap(slot, ph);
        }
      }
    };
  }

  CA.render = { element: element, swap: swap, mediaSlot: mediaSlot, groupLabel: groupLabel };
})(window);

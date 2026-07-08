// A minimal fake of the subset of the Leaflet API static/app.js uses, so
// app.js can be loaded and exercised under jsdom without a real map/renderer.
// Not a general-purpose Leaflet mock — only what app.js actually calls.
export function createLeafletStub() {
  function makeLayer(extra = {}) {
    const layer = {
      _addedTo: null,
      _listeners: {},
      on(event, cb) {
        (layer._listeners[event] ||= []).push(cb);
        return layer;
      },
      fire(event, ...args) {
        (layer._listeners[event] || []).forEach((cb) => cb(...args));
      },
      addTo(target) {
        layer._addedTo = target;
        if (target && target._children) target._children.push(layer);
        return layer;
      },
    };
    return Object.assign(layer, extra);
  }

  const L = {
    map() {
      const map = makeLayer({
        _children: [],
        setView() { return map; },
        removeLayer(l) {
          map._children = map._children.filter((c) => c !== l);
        },
        fitBounds() {},
        panTo() {},
        invalidateSize() {},
        getCenter() { return { lat: 39.5, lng: -98.35 }; },
      });
      return map;
    },

    tileLayer() {
      return makeLayer();
    },

    layerGroup() {
      const group = makeLayer({
        _children: [],
        clearLayers() { group._children = []; },
      });
      return group;
    },

    polyline(coords, style) {
      return makeLayer({
        coords,
        style,
        setStyle(s) { this.style = s; },
        bringToFront() {},
      });
    },

    marker([lat, lon], opts = {}) {
      const marker = makeLayer({
        lat,
        lon,
        icon: opts.icon,
        zIndexOffset: 0,
        _icon: null,
        _popupHtml: null,
        _popupOpen: false,
        addTo(target) {
          marker._addedTo = target;
          if (target && target._children) target._children.push(marker);
          // Real Leaflet renders the marker's icon element once it's added
          // to the map/layer; fake that with a real DOM node so classList
          // operations elsewhere in app.js work against real jsdom nodes.
          marker._icon = document.createElement("div");
          if (marker.icon) {
            marker._icon.className = marker.icon.className || "";
            marker._icon.innerHTML = marker.icon.html || "";
          }
          return marker;
        },
        bindPopup(html) { marker._popupHtml = html; return marker; },
        openPopup() { marker._popupOpen = true; },
        setZIndexOffset(n) { marker.zIndexOffset = n; },
        getLatLng() { return { lat: marker.lat, lng: marker.lon }; },
      });
      return marker;
    },

    divIcon(opts) {
      return opts;
    },

    featureGroup(layers) {
      return { layers, getBounds() { return {}; } };
    },
  };

  return L;
}

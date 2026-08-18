(function () {
  var root = document.documentElement;
  var STORAGE_KEY = "gracesoft-docs-theme";

  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }
    var effective = theme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.textContent = effective === "dark" ? "Light mode" : "Dark mode";
    }

    // The brand-colored wordmark's second glyph group has no explicit fill
    // (defaults to black), so it's invisible on a dark surface — swap to
    // the all-white variant instead of trying to recolor it with a filter.
    var logo = document.getElementById("brand-logo");
    if (logo) {
      logo.setAttribute("src", effective === "dark" ? "assets/wm-w.svg" : "assets/wm.svg");
    }
  }

  var stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    /* localStorage unavailable (e.g. file:// in some browsers) — fall back to system preference */
  }
  applyTheme(stored);

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-toggle");
    applyTheme(stored);
    if (btn) {
      btn.addEventListener("click", function () {
        var current = root.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
        var next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch (e) {
          /* ignore */
        }
      });
    }

    // Highlight the current page + in-page section in the sidebar.
    var here = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".sidebar-group a[href]").forEach(function (link) {
      var href = link.getAttribute("href").split("#")[0] || "index.html";
      if (href === here) link.classList.add("active");
    });
  });

  // Keep the wordmark in sync if the system theme changes while no manual override is stored.
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (!root.getAttribute("data-theme")) applyTheme(null);
    });
  }
})();

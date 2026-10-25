// same as torment nexus tracker, just copy and paste into console
// despite WASD being displayed, arrows also work as a heads up.
(() => {
    const KEYBOARD_LISTENER = "__DOGONLINE_KEYBOARD_LISTENER__";

    const existing = window[KEYBOARD_LISTENER];
    const listeners = existing?.state?.listeners;
    if (typeof existing?.destroy === "function") existing.destroy();
    for (const listener of listeners?.active ?? []) {
        listener.element?.removeEventListener(listener.event, listener.handler);
    }
    if (listeners?.main != null) clearInterval(listeners.main);

    const selector = (name) => `[class*="${name}__"]`;

    const SELECTORS = {
        BUTTON: ["button", "a", '[role="button"]']
            .map((tag) => tag + selector("Button_button"))
            .join(","),
        MODAL:
            'dialog[open], [role="dialog"], [role="alertdialog"], ' +
            selector("Dialog_content"),
    };

    const KEYS = {
        OPTION: ["e", "r", "t"],
        DIRECTION: {
            arrowup: "Up",
            w: "Up",
            arrowdown: "Down",
            s: "Down",
            arrowleft: "Left",
            a: "Left",
            arrowright: "Right",
            d: "Right",
        },
    };

    const KEYS_WITH_HANDLERS = new Set([
        ...KEYS.OPTION,
        ...Object.keys(KEYS.DIRECTION),
        "l",
        "1",
        "2",
        "3",
        "4",
    ]);

    const picker = {
        select: null,
        cleanup: null,
        release: null,
    };

    const indicators = new Map();
    const indicator = {
        controls: null,
        style: null,
        frame: null,
        obs: null,
        resize: null,
        dirty: true,
        last_sync: 0,
        destroyed: false,
    };

    const has_class = (element, name) =>
        [...element.classList].some(
            (token) => token === name || token.startsWith(name + "__"),
        );
    const query = (context, name) => context.querySelector(selector(name));

    function rendered(element, ignore_opacity = false) {
        if (
            !(element instanceof Element) ||
            !element.isConnected ||
            !element.getClientRects().length
        )
            return false;
        if (element.closest("[hidden], dialog:not([open])")) return false;
        const style = getComputedStyle(element);
        if (style.visibility === "hidden" || style.visibility === "collapse")
            return false;
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
            const ancestor_style = getComputedStyle(ancestor);
            if (
                ancestor_style.display === "none" ||
                ancestor_style.contentVisibility === "hidden" ||
                (!ignore_opacity && Number(ancestor_style.opacity) === 0)
            )
                return false;
        }
        return true;
    }

    function visible(element) {
        return (
            rendered(element) && !element.closest('[inert], [aria-hidden="true"]')
        );
    }

    function available(element) {
        if (
            !visible(element) ||
            element.matches(":disabled") ||
            element.hasAttribute("disabled")
        )
            return false;
        if (element.closest('[aria-disabled="true"]')) return false;
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
            if (
                has_class(ancestor, "tower_disabled") ||
                has_class(ancestor, "Button_disabled") ||
                ancestor.classList.contains("disabled")
            )
                return false;
        }
        return getComputedStyle(element).pointerEvents !== "none";
    }

    function process(evt) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
    }

    function activate(evt, element) {
        process(evt);
        if (!available(element)) return;
        if (typeof element.click === "function") element.click();
        else
            element.dispatchEvent(
                new MouseEvent("click", {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                }),
            );
    }

    function tower() {
        const markers = [
            "tower_towerGameplay",
            "tower_towerOptions",
            "tower_enterTowerBtns",
            "tower_towerError",
        ];
        const marker = [
            ...document.querySelectorAll(markers.map(selector).join(",")),
        ].find((element) => rendered(element));
        return (
            marker?.closest('main, [class*="Layout_main__"]') ??
            marker?.parentElement ??
            null
        );
    }

    const MODALS = {
        rank: (modal) => {
            let z_index = 0;
            for (let element = modal; element; element = element.parentElement) {
                z_index = Math.max(
                    z_index,
                    Number.parseFloat(getComputedStyle(element).zIndex) || 0,
                );
            }
            let native = false;
            try {
                native = modal.matches(":modal");
            } catch { }
            return [Number(native), z_index];
        },
        top: () => {
            const modals = [...document.querySelectorAll(SELECTORS.MODAL)].filter(
                (modal) =>
                    modal.dataset.state !== "closed" &&
                    rendered(modal, true) &&
                    !modal.closest('[inert], [aria-hidden="true"]'),
            );
            const leaves = modals.filter(
                (modal) =>
                    !modals.some((other) => other !== modal && modal.contains(other)),
            );
            leaves.sort((left, right) => {
                const a = MODALS.rank(left),
                    b = MODALS.rank(right);
                return a[0] - b[0] || a[1] - b[1];
            });
            return leaves.at(-1) ?? null;
        },
        options: (modal) => {
            const buttons = [
                ...modal.querySelectorAll(
                    'button, a[href], [role="button"], input[type="button"], input[type="submit"]',
                ),
            ].filter(
                (button) =>
                    button.closest(SELECTORS.MODAL) === modal && visible(button),
            );
            const actionSelector =
                selector("ButtonGroup_groupContainer") +
                "," +
                selector("Dialog_actions");
            const actions = buttons.filter((button) => {
                const group = button.closest(actionSelector);
                return group && modal.contains(group);
            });
            if (actions.length) return actions;
            const styled = buttons.filter((button) =>
                button.matches(SELECTORS.BUTTON),
            );
            if (styled.length) return styled;
            return buttons.filter(
                (button) =>
                    !(
                        button.getAttribute("aria-label")?.toLowerCase() === "close" &&
                        !button.textContent.trim()
                    ),
            );
        },
    };

    function options(scope) {
        return [...scope.querySelectorAll(SELECTORS.BUTTON)].filter(
            (button) =>
                visible(button) &&
                !button.closest("#tower-controls") &&
                !button.closest(selector("tower_tuiButtonsSection2")),
        );
    }

    function button_classes() {
        const classes = {};
        const collect = (tokens) => {
            for (const token of tokens) {
                if (token.startsWith("Button_button__")) classes.button ??= token;
                if (token.startsWith("Button_primary__")) classes.primary ??= token;
            }
        };
        for (const button of document.querySelectorAll(SELECTORS.BUTTON)) {
            if (!button.closest("#tower-controls")) collect(button.classList);
        }
        const visited = new Set();
        const scan = (sheet) => {
            if (!sheet || visited.has(sheet) || (classes.button && classes.primary))
                return;
            visited.add(sheet);
            let rules;
            try {
                rules = sheet.cssRules;
            } catch {
                return;
            }
            for (const rule of rules ?? []) {
                if (rule.selectorText) {
                    collect(
                        [
                            ...rule.selectorText.matchAll(
                                /\.(Button_(?:button|primary)__[\w-]+)/g,
                            ),
                        ].map((match) => match[1]),
                    );
                }
                if (rule.cssRules) scan(rule);
                if (rule.styleSheet) scan(rule.styleSheet);
            }
        };
        for (const sheet of document.styleSheets) scan(sheet);
        return [classes.button, classes.primary].filter(Boolean).join(" ");
    }

    function add_styles() {
        document.getElementById("tower-keyboard-styles")?.remove();
        const style = document.createElement("style");
        style.id = "tower-keyboard-styles";
        style.textContent = `
                #tower-controls button {
                        z-index: 9999999;
                        position: fixed;
                        top: 0;
                        right: 0;
                        margin: 8px;
                        pointer-events: auto;
                        background-color: #f44336;
                        border-color: #da190b;
                }
                #tower-controls button:hover {
                        background-color: #da190b;
                        border-color: #b91507;
                }
                .tower-key-indicator-anchor {
                        position: fixed;
                        width: 0;
                        height: 0;
                        pointer-events: none;
                        z-index: 9999998;
                }
                .tower-key-indicator {
                        position: absolute;
                        left: 0px;
                        top: -6px;
                        pointer-events: none;
                        background-color: black;
                }
        `;
        document.head.appendChild(style);
        return style;
    }

    function add_controls() {
        document.getElementById("tower-controls")?.remove();
        const root = document.querySelector("div#__next");
        if (!root) return null;
        const container = document.createElement("div");
        container.id = "tower-controls";
        const button = document.createElement("button");
        button.type = "button";
        button.className = button_classes();
        button.textContent = "Remove keyboard controls";
        button.addEventListener("click", () => controller.destroy());
        container.append(button);
        root.append(container);
        return container;
    }

    function indicator_host(element) {
        const dialog = element.closest("dialog[open]");
        try {
            if (dialog?.matches(":modal")) return dialog;
        } catch { }
        return document.body;
    }

    function create_indicator(element, key) {
        if (indicator.destroyed || !(element instanceof Element)) return null;
        let entry = indicators.get(element);
        if (!entry) {
            const anchor = document.createElement("div");
            anchor.className = "tower-key-indicator-anchor";
            anchor.setAttribute("aria-hidden", "true");
            const indicator = document.createElement("div");
            indicator.className = "tower-key-indicator";
            const text = document.createElement("span");
            text.innerHTML = "&nbsp;[" + key.charAt(0).toUpperCase() + "]&nbsp;";
            indicator.appendChild(text);
            anchor.append(indicator);
            const host = indicator_host(element);
            host.append(anchor);
            entry = { anchor, indicator, host, automatic: false };
            indicators.set(element, entry);
            indicator.resize?.observe(element);
        }
        entry.indicator.dataset.key = String(key);
        entry.indicator.dataset.disabled = String(!available(element));
        position_indicator(element, entry);
        return entry.indicator;
    }

    function remove_indicator(element, entry) {
        indicator.resize?.unobserve(element);
        entry.anchor.remove();
        indicators.delete(element);
    }

    function position_indicator(element, entry) {
        const shown = visible(element);
        entry.anchor.hidden = !shown;
        if (!shown) return;
        const host = indicator_host(element);
        if (entry.host !== host) {
            host.append(entry.anchor);
            entry.host = host;
        }
        const rect = element.getBoundingClientRect();
        const left = `${rect.left}px`,
            top = `${rect.top}px`;
        if (entry.anchor.style.left !== left) entry.anchor.style.left = left;
        if (entry.anchor.style.top !== top) entry.anchor.style.top = top;
    }

    function binding_available(binding) {
        return (
            available(binding.element) && (!binding.guard || available(binding.guard))
        );
    }

    function update_indicators() {
        const assignments = new Map();
        for (const [key, binding] of bindings()) {
            if (!binding.element || !visible(binding.element)) continue;
            let assigned = assignments.get(binding.element);
            if (!assigned)
                assignments.set(binding.element, (assigned = { keys: [], binding }));
            assigned.keys.push(key);
        }
        const arrows = {
            arrowup: "↑",
            arrowdown: "↓",
            arrowleft: "←",
            arrowright: "→",
        };
        for (const [element, assigned] of assignments) {
            const key = [...assigned.keys]
                .sort(
                    (a, b) =>
                        Number(a.startsWith("arrow")) - Number(b.startsWith("arrow")),
                )
                .map((key) => arrows[key] ?? key.toUpperCase())
                .join(" / ");
            const indicator = create_indicator(element, key);
            indicators.get(element).automatic = true;
            indicator.dataset.keys = assigned.keys.join(" ");
            indicator.dataset.disabled = String(!binding_available(assigned.binding));
        }
        for (const [element, entry] of indicators) {
            if (
                !element.isConnected ||
                (entry.automatic && !assignments.has(element))
            )
                remove_indicator(element, entry);
        }
        indicator.dirty = false;
    }

    function request_indicators() {
        indicator.dirty = true;
    }

    function indicator_tick(time) {
        if (indicator.destroyed) return;
        if (indicator.dirty || time - indicator.last_sync >= 150) {
            update_indicators();
            indicator.last_sync = time;
        }
        // Follow scrolling, resizing, and CSS animations without moving the controls.
        for (const [element, entry] of indicators)
            position_indicator(element, entry);
        indicator.frame = requestAnimationFrame(indicator_tick);
    }

    function own_indicator_node(node) {
        const element = node instanceof Element ? node : node.parentElement;
        return !!element?.closest(
            ".tower-key-indicator-anchor, #tower-controls, #tower-keyboard-styles",
        );
    }

    function start_indicators() {
        indicator.obs = new MutationObserver((mutations) => {
            if (
                mutations.some(
                    (mutation) =>
                        !own_indicator_node(mutation.target) &&
                        (mutation.type !== "childList" ||
                            [...mutation.addedNodes, ...mutation.removedNodes].some(
                                (node) => !own_indicator_node(node),
                            )),
                )
            )
                request_indicators();
        });
        indicator.obs.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: [
                "class",
                "style",
                "hidden",
                "disabled",
                "aria-disabled",
                "aria-hidden",
                "inert",
                "open",
                "data-state",
            ],
        });
        if (typeof ResizeObserver === "function") {
            indicator.resize = new ResizeObserver(request_indicators);
        }
        window.addEventListener("resize", request_indicators);
        update_indicators();
        indicator.frame = requestAnimationFrame(indicator_tick);
    }

    function tracking() {
        if (picker.release !== null) clearTimeout(picker.release);
        picker.release = null;
        picker.cleanup?.();
        picker.cleanup = null;
        picker.select = null;
    }

    function level_select(event, select) {
        process(event);
        if (!available(select)) return;
        tracking();
        picker.select = select;
        const releaseFocus = () => {
            select.blur();
            tracking();
        };
        select.addEventListener("change", releaseFocus);
        select.addEventListener("blur", tracking);
        picker.cleanup = () => {
            select.removeEventListener("change", releaseFocus);
            select.removeEventListener("blur", tracking);
        };
        select.focus({ preventScroll: true });
        try {
            if (typeof select.showPicker === "function") select.showPicker();
            else select.click();
        } catch {
            select.click();
        }
    }

    function bindings() {
        const result = new Map();
        const assign = (key, element, type = "click", guard = null) =>
            result.set(key, { element: element ?? null, type, guard });
        const scope = tower();
        if (!scope) return result;

        const modal = MODALS.top();
        if (modal) {
            for (const key of KEYS_WITH_HANDLERS) assign(key, null);
            const choices = MODALS.options(modal);
            KEYS.OPTION.forEach((key, index) => assign(key, choices[index]));
            return result;
        }

        const cutscene = query(scope, "tower_tuiCutscene");
        if (visible(cutscene)) {
            assign(
                "e",
                [...cutscene.querySelectorAll(SELECTORS.BUTTON)].find(visible),
            );
            return result;
        }

        const choices = options(scope);
        KEYS.OPTION.forEach((key, index) => {
            if (choices[index]) assign(key, choices[index]);
        });

        const setup = query(scope, "tower_towerOptions");
        if (visible(setup)) {
            const select = setup.querySelector("select");
            if (visible(select)) assign("s", select, "select");
        }

        const bottom = query(scope, "tower_tuiButtonsSection2");
        if (visible(bottom)) {
            for (const key of ["l", "r"]) {
                const label =
                    key === "l"
                        ? /^leave (?:the )?tower\b/i
                        : /^run from (?:battle|fight)\b/i;
                const button = [...bottom.querySelectorAll(SELECTORS.BUTTON)].find(
                    (element) =>
                        visible(element) && label.test(element.textContent.trim()),
                );
                if (button) assign(key, button);
            }
        }

        const controls = query(scope, "tower_tuiDirectionControls");
        if (visible(controls)) {
            for (const [key, direction] of Object.entries(KEYS.DIRECTION)) {
                if (key !== "s" || !visible(setup))
                    assign(key, query(controls, "tower_btn" + direction));
            }
        }

        const weapons = query(scope, "tower_tuiCombatItems");
        if (visible(weapons)) {
            const slots = [...weapons.children].filter((element) =>
                has_class(element, "tower_combatCell"),
            );
            for (let index = 0; index < 4; index++) {
                const slot = slots[index];
                assign(
                    String(index + 1),
                    slot && !has_class(slot, "tower_empty") ? slot : null,
                    "click",
                    weapons,
                );
            }
        }

        const textbox = query(scope, "tower_tuiTextbox");
        if (visible(textbox)) {
            if (available(textbox)) assign("e", textbox);
            else if (textbox.querySelector(selector("tower_textboxSpinner")))
                assign("e", null);
        }
        return result;
    }

    function keypress(event) {
        if (
            event.defaultPrevented ||
            event.isComposing ||
            event.ctrlKey ||
            event.altKey ||
            event.metaKey ||
            event.repeat
        )
            return;
        if (
            event.target instanceof Element &&
            event.target.closest("#tower-controls")
        )
            return;

        const key = event.key.toLowerCase();
        const editing = event
            .composedPath()
            .find(
                (node) =>
                    node instanceof Element &&
                    (node.isContentEditable ||
                        node.matches(
                            'input, textarea, select, [role="textbox"], [role="combobox"]',
                        )),
            );
        if (editing) {
            if (editing === picker.select && (key === "enter" || key === "escape")) {
                picker.release = setTimeout(() => {
                    picker.select?.blur();
                    tracking();
                }, 0);
            }
            return;
        }
        if (!KEYS_WITH_HANDLERS.has(key)) return;
        const binding = bindings().get(key);
        if (!binding) return;
        if (binding.type === "select") level_select(event, binding.element);
        else if (binding.guard && !available(binding.guard)) process(event);
        else activate(event, binding.element);
        request_indicators();
    }

    const controller = {
        createIndicator: create_indicator,
        destroy() {
            indicator.destroyed = true;
            window.removeEventListener("keydown", keypress, true);
            window.removeEventListener("resize", request_indicators);
            if (indicator.frame !== null) cancelAnimationFrame(indicator.frame);
            indicator.obs?.disconnect();
            indicator.resize?.disconnect();
            for (const [element, entry] of indicators)
                remove_indicator(element, entry);
            tracking();
            indicator.controls?.remove();
            indicator.controls = null;
            indicator.style?.remove();
            indicator.style = null;
            if (window[KEYBOARD_LISTENER] === controller)
                delete window[KEYBOARD_LISTENER];
            console.log("Tower Keyboard Controls Removed!");
        },
    };

    window[KEYBOARD_LISTENER] = controller;
    window.addEventListener("keydown", keypress, true);
    indicator.style = add_styles();
    indicator.controls = add_controls();
    start_indicators();
    console.info("Tower Keyboard Controls Enabled!");
})();

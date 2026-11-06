// ==UserScript==
// @name         Torment Nexus Tracker
// @namespace    http://tampermonkey.net/
// @version      5.0.4
// @description  Torment Nexus Tracker
// @author       Rei Wolf (aka Estradiol aka Savestate)
// @match        https://*.dogonline.net/*
// @icon         https://dogonline.net/img/items/weapons/Weapon_Plasma_Ranged.png
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Savestate2A03/dogonline-torment-nexus-tracker/refs/heads/main/TOWER-TRACKER.js
// @downloadURL  https://raw.githubusercontent.com/Savestate2A03/dogonline-torment-nexus-tracker/refs/heads/main/TOWER-TRACKER.js
// @homepage     https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/
// @homepageURL  https://github.com/Savestate2A03/dogonline-torment-nexus-tracker/
// @top-level-await
// ==/UserScript==

(await(async () => {
    // store data on window
    const CACHE_KEY = '__DOG_DATA_TOWER_QUEUE_WINDOW_KEY__';
    // increase anytime the localStorage schema changes
    const TRACKER_VERSION = 7;
    const LOCALSTORAGE_VERSION_KEY = '__SAVED_TOWER_TRACKER_VERSION__';
    const INSTANCE_KEY = '__DOGONLINE_TOWER_TRACKER_INSTANCE__';
    const get_saved_tracker_version = () => {
        try {
            const version = Number(localStorage.getItem(LOCALSTORAGE_VERSION_KEY));
            return Number.isSafeInteger(version) && version > 0 ? version : 0;
        } catch {
            return 0;
        }
    };
    const check_tracker_version = () => {
        const previous_instance = window[INSTANCE_KEY];
        const previous_version = Math.max(get_saved_tracker_version(), previous_instance?.version ?? 0);
        if (previous_version > TRACKER_VERSION) {
            console.error(
                `Tower tracker init aborted: ` +
                `current version (${previous_version})` +
                `is newer than this version (${TRACKER_VERSION})!`
            );
            return null;
        }
        if (!previous_instance && window[CACHE_KEY]?.original_fetch) {
            console.error(
                'Tower tracker init aborted: ' +
                'a legacy instance is running. ' +
                'Reload the page first!'
            );
            return null;
        }
        return previous_version;
    };
    const claim_tracker_version = () => {
        const version = check_tracker_version();
        if (version === null) return null;
        try {
            localStorage.setItem(LOCALSTORAGE_VERSION_KEY, String(TRACKER_VERSION));
            return version;
        } catch (err) {
            console.error(
                'Tower tracker init aborted: ' +
                'could not save its version. ' +
                'An existing tracker was left running:',
                err
            );
            return null;
        }
    };
    let previous_version;
    try {
        if (!navigator.locks?.request) throw new Error('Instance locking is unavailable.');
        previous_version = await navigator.locks.request(LOCALSTORAGE_VERSION_KEY, claim_tracker_version);
    } catch (err) {
        console.error('Tower tracker init aborted: could not take instance!', err);
        return null;
    }
    if (previous_version === null || check_tracker_version() === null) return null;
    const previous_instance = window[INSTANCE_KEY];
    previous_instance?.destroy();
    const instance = {
        version: TRACKER_VERSION,
        active: true,
        display_cleanup: null,
        fetch: null,
        scroll: null,
        keyboard: null,
        is_current() {
            if (!this.active) return false;
            if (window[INSTANCE_KEY] !== this || get_saved_tracker_version() > this.version) {
                this.destroy();
                return false;
            }
            return true;
        },
        destroy() {
            if (!this.active) return;
            this.active = false;
            this.display_cleanup?.();
            this.display_cleanup = null;
            clear_upcoming_mobs();
            this.keyboard?.destroy();
            this.keyboard = null;
            if (window[INSTANCE_KEY] === this) {
                CACHE.set('initalized', false);
                CACHE.set('display_cleanup', null);
                CACHE.get('clone_grayscale')?.cancel();
                CACHE.set('clone_grayscale', null);
                mob_queue_info_hide();
            }
            if (this.fetch !== null && window.fetch === this.fetch) window.fetch = CACHE.get('original_fetch');
            if (this.scroll !== null && window.scrollTo === this.scroll) window.scrollTo = CACHE.get('native_scroll');
            window.removeEventListener('storage', version_changed);
        },
        attach_keyboard(install) {
            if (this.is_current()) this.keyboard = install(this);
        },
    };
    const version_changed = event => {
        if (event.key !== LOCALSTORAGE_VERSION_KEY || event.storageArea !== localStorage) return;
        if (Number(event.newValue) > instance.version) instance.destroy();
        else instance.is_current();
    };
    window[INSTANCE_KEY] = instance;
    window.addEventListener('storage', version_changed);

    // choose a logging level
    //  - everything
    //  - notice
    //  - info
    //  - log (original site logs + warn/error)
    //  - warn
    //  - error
    const LOGGING_LEVEL = 'everything';

    const SAVED_LOCALSTORAGE_OBJECTS = [
        'state',
        'prev',
        'user_combat_items',
        'tower_state_raw',
        'enemy_queue',
        'original_enemy_hp',
        'removal_pending',
        'session_stats',
        'user_options'
    ];
    const LOCALSTORAGE_KEY = 'SAVED_TOWER_TRACKER_DATA';
    let pending_weapon_use = null;
    let tower_revision = 0;
    let next_request_id = 0;
    let upcoming_mob_revision = 0;
    let restarting = false;

    const TOWER_STYLE = `
        :root {
            interpolate-size: allow-keywords;
        }
        #tower-options {
            --top: 0px;
            --right: 0px;
            margin: 0;
            padding: 0;
            position: fixed;
            top: var(--top, 8px);
            right: var(--right, 8px);
            display: flex;
            flex-direction: column;
            z-index: 9999999;
            margin-right: 12px;
            margin-top: 6px;
            background-color: rgba(0, 0, 0, 0.0);
            padding: 0px;
            transition:
                padding 0.3s ease,
                background-color 0.3s ease;

            font-size: 24px;
            * {
                font-size: inherit;
            }
        }
        #tower-options:has(#tower-option-list-wrapper.expanded) {
            background-color: rgba(0, 0, 0, 1.0);
            padding: 16px;
        }
        #tower-options-expand, #tower-option-list {
        }
        #tower-options-expand {
            text-align: right;
            user-select: none;

            --options-text: var(--text);
            color: var(--options-text);
            transition: color 0.5s ease;

            span {
                cursor: pointer;
                position: relative;
                top: 0px;
                left: 0px;

                &:hover {
                    text-shadow: 0 0 3px white;
                }
                &:active {
                    opacity: 0.7;
                    position: relative;
                    top: 1px;
                    left: 1px;
                }
            }
        }
        #tower-options:has(#tower-option-list-wrapper.expanded) #tower-options-expand {
            --options-text: #eee;
        }
        #tower-option-list-wrapper {
            --options-text: #eee;
            display: grid;
            grid-template-rows: 0fr;
            transition: grid-template-rows 0.3s ease;
            overflow: hidden;
            color: var(--options-text);

            &.expanded {
                grid-template-rows: 1fr;
            }
        }
        #tower-option-list {
            min-height: 0;
        }
        .tower-option-button {
            text-align: center;
            width: fit-content;
            margin-left: auto;
            margin-right: auto;
            border-style: solid;
            border-width: 1px;
            padding: 4px 16px;
            margin-top: 14px;
            position: relative;
            user-select: none;

            &:hover {
                background-color: #333;
            }

            &:active {
                background-color: #161616;
                top: 1px;
                left: 1px;
            }
        }
        :where(input).tower-option-button {
            appearance: none;
            display: block;
            box-sizing: border-box;
            min-width: 0;
            border-color: currentColor;
            border-radius: 0;
            background: transparent;
            color: inherit;
            font: inherit;
            outline: none;
            user-select: text;

            &::placeholder {
                color: #888;
                opacity: 1;
            }
        }
        .tower-option-list-item {
            display: flex;
            flex-direction: row;
            gap: 6px;
            justify-content: flex-start;
            align-items: center;
            &.disabled {
                --options-text: #777;
                pointer-events: none;
                .tower-option-list-item-label {
                    color: var(--options-text);
                }
                .tower-option-list-item-input {
                    &[type="checkbox"] {
                        &:checked {
                            &::before {
                                color: var(--options-text);
                            }
                        }
                    }
                }
            }
        }
        .tower-option-list-item-input {
            &[type="checkbox"] {
                appearance: none;
                -webkit-appearance: none;
                margin: 0;
                padding: 0;
                width: 16px;
                height: 16px;
                border-color: var(--options-text);
                border-width: 1px;
                border-style: solid;
                position: relative;
                top: 0px;
                left: 0px;
                color: inherit;

                &:hover {
                    text-shadow: 0 0 2px white;
                }

                &:active {
                    top: 1px;
                    left: 1px;
                }

                &::before {
                    color: inherit;
                    content: "";
                    font-family: NDS BIOS, sans-serif;
                    font-size: 32px;
                    line-height: 16px;
                    position: absolute;
                    top: -5px;
                    left: 0px;
                    display: block;
                    width: 17px;
                    height: 17px;
                    margin: 0;
                    padding: 0;
                    text-align: center;
                }

                &:checked {
                    &::before {
                        content: "x";
                    }
                }
            }
        }
        .tower-option-list-item-label { }
        #tower-options-restart {
            display: block;
            margin: 16px 0 0;
            padding: 0;
            border: 0;
            background: none;
            color: var(--options-text);
            font-family: inherit;
            text-align: left;
            cursor: pointer;
        }
        #tower-options-restart:hover {
            color: red;
        }
        #tower-keyboard-bindings {
            display: grid;
            grid-template-rows: 1fr;
            margin: 4px 0 0 22px;
            padding: 0 10px 6px 2.5px;
            border: 0;
            border-left-width: 0px;
            border-left-style: none;
            border-left-color: currentcolor;
            border-left-width: 0px;
            border-left-style: none;
            border-left-color: currentcolor;
            border-left: 2px solid var(--options-text, currentColor);
            min-width: 0;
            font-size: 16px;
            transition: grid-template-rows 0.3s ease, padding 0.3s ease;
            color: var(--options-text);
        }
        #tower-keyboard-bindings:disabled {
            grid-template-rows: 0fr;
            padding: 0 10px 0px 2px;
        }
        #tower-keyboard-bindings > div {
            min-height: 0;
            overflow: hidden;
        }
        #tower-keyboard-bindings .tower-keyboard-group-title {
            margin-top: 5px;
            font-size: 24px;
            border-bottom: solid 1px white;
            padding-bottom: 2px;
            margin-bottom: 8px;
            margin-left: 4px;
        }
        #tower-keyboard-bindings .tower-keyboard-binding {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 3px;
            margin-left: 12px;
            margin-right: 6px;
        }
        #tower-keyboard-bindings input {
            width: 76px;
            min-width: 76px;
            padding: 1px 5px;
            border: 1px solid var(--options-text, currentColor);
            border-radius: 3px;
            background: transparent;
            color: var(--options-text);
            font-family: inherit;
            font-size: 16px;
            text-align: center;
            cursor: pointer;
        }
        #tower-keyboard-bindings input:focus {
            outline: 1px solid var(--options-text, currentColor);
            box-shadow: 0 0 3px var(--options-text, currentColor);
        }
        #tower-keyboard-bindings .tower-keyboard-hint,
        #tower-keyboard-binding-status {
            width: 216px;
            margin: 5px 0;
            margin-left: 0px;
            font-size: 16px;
            line-height: 14px;
            margin-left: 6px;
        }
        #tower-keyboard-binding-status {
            color: #4cc;
        }
        #tower-keyboard-binding-status span {
            color: #eee;
        }
        #tower-stats {
            --top: 0px;
            --left: 0px;
            width: 240px;
            position: fixed;
            margin: 0;
            padding: 0;
            margin-top: 8px;
            margin-left: 8px;
            top: var(--top);
            left: var(--left);
            display: none;
            overflow: visible;
            flex-direction: column;
            align-items: center;
            gap: 4px;

            filter:
                drop-shadow(2px 0px 0px var(--surface-bg))
                drop-shadow(-2px 0px 0px var(--surface-bg))
                drop-shadow(0px 2px 0px var(--surface-bg))
                drop-shadow(0px -2px 0px var(--surface-bg))
                drop-shadow(1px 1px 1px var(--surface-bg))
                drop-shadow(1px 1px 2px color-mix(in srgb, var(--text) 15%, transparent));

            z-index: 999999;
        }
        #tower-stats-title, #tower-stats-title-lower {
            font-family: NDS BIOS,sans-serif;
            color: var(--text);
            font-size: 24px;
            margin: 0;
            padding: 0;
            line-height: 24px;
        }
        #tower-stats-subtitle, #tower-stats-slain, #tower-stats-loot {
            font-family: NDS BIOS, sans-serif;
            color: var(--text);
            font-size: 16px;
            margin: 0;
            padding: 0;
            line-height: 16px;
            width: 100%;
            text-align: center;

            &#tower-stats-slain, &#tower-stats-loot {
                width: 90%;
                text-align: left;
            }
        }
        #tower-stats-queue, #tower-stats-loot-list {
            --mask-height: 100px;
            mask-image:
                linear-gradient(to bottom, transparent, black),
                linear-gradient(to bottom, black, black),
                linear-gradient(to bottom, black, transparent);
            mask-repeat: no-repeat, no-repeat, no-repeat;
            mask-size: 100% 0px, 100% 100%, 100% 0px;
            mask-position: top center, center 0px, bottom center;

            -webkit-mask-image:
                linear-gradient(to bottom, transparent, black),
                linear-gradient(to bottom, black, black),
                linear-gradient(to bottom, black, transparent);
            -webkit-mask-repeat: no-repeat, no-repeat, no-repeat;
            -webkit-mask-size: 100% 0px, 100% 100%, 100% 0px;
            -webkit-mask-position: top center, center 0px, bottom center;

            animation: adjust-masks 1s linear both paused;
        }
        #tower-stats-queue {
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            height: calc(280px - 8px - 24px);
            gap: 0px;

            --scrollbar-handle-r: calc((255 + 249)/2);
            --scrollbar-handle-g: calc((229 + 165)/2);
            --scrollbar-handle-b: calc((0 + 0)/2);

            --scrollbar-base-r: 255;
            --scrollbar-base-g: 0;
            --scrollbar-base-b: 88;

            transition: height 1s ease;

            overflow-y: scroll;
            scrollbar-width: thin;
            scrollbar-color:
                rgba(var(--scrollbar-handle-r), var(--scrollbar-handle-g), var(--scrollbar-handle-b), 0.75)
                rgba(var(--scrollbar-base-r), var(--scrollbar-base-g), var(--scrollbar-base-b), 0.525);

            /* put scrollbar on left side */

            direction: rtl;
            * {
                direction: ltr;
            }

            &.too-big {
                height: 0px;
            }

            div.tower-stats-enemy {
                display: flex;
                margin: 0;
                padding: 0;
                flex-direction: row;
                flex-wrap: nowrap;
                align-items: center;
                justify-content: space-evenly;
                gap: 0px;

                width: 100%;

                div {
                    font-family: NDS BIOS,sans-serif;
                    color: var(--text);
                    font-size: 16px;
                    line-height: 16px;
                }

                div.tower-stats-enemy-index {
                    min-width: 38px;
                    max-width: 38px;
                    text-align: center;
                }

                div.tower-stats-enemy-image {
                    position: relative;
                    max-width: 32px;
                    max-height: 32px;
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center center;
                    min-width: 32px;
                    min-height: 32px;
                    image-rendering: auto;

                    &.tower-stats-enemy-image-clone::before {
                        content: "";
                        position: absolute;
                        top: 0px;
                        left: 0px;
                        width: 100%;
                        height: 100%;

                        background-image: inherit;
                        background-size: contain;
                        background-repeat: no-repeat;
                        background-position: center center;

                        filter: grayscale(100%);
                    }

                    &.tower-stats-enemy-image-clone::after {
                        content: "";
                        position: absolute;
                        top: 1px;
                        left: -3px;
                        width: 50%;
                        height: 50%;

                        --emerald-glow: rgba(164, 255, 104, 0.5);
                        --outline-size: 1px;

                        background-image: url('/img/items/weapons/Weapon_Plasma_Ranged.png');
                        background-size: contain;
                        background-repeat: no-repeat;
                        background-position: center center;

                        opacity: 1.0;

                        filter:
                            drop-shadow(calc(var(--outline-size) * 1.0) 0px 0px var(--emerald-glow))
                            drop-shadow(calc(var(--outline-size) * -1.0) 0px 0px var(--emerald-glow))
                            drop-shadow(0px calc(var(--outline-size) * 1.0) 0px var(--emerald-glow))
                            drop-shadow(0px calc(var(--outline-size) * -1.0) 0px var(--emerald-glow));
                    }
                }

                div.tower-stats-enemy-stacked-info {
                    display: flex;
                    margin: 0;
                    padding: 0;
                    flex-direction: column;
                    align-items: center;
                    gap: 0px;
                    width: 146px;

                    div.tower-stats-enemy-name-wrapper {
                        display: flex;
                        margin: 0;
                        padding: 0;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 0px;
                        height: 16px;

                        div.tower-stats-enemy-name {
                            text-align: center;
                        }
                    }

                    div.tower-stats-enemy-hp-wrapper {
                        --full-width: 120px;
                        --full-height: 20px;
                        --bar-scalar: 0.90;
                        --current-percentage: 100%;

                        display: flex;
                        margin: 0;
                        padding: 0;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 0px;
                        width: var(--full-width);
                        height: var(--full-height);

                        image-rendering: auto;

                        background-image:
                            url('/img/tower/tower_ui_lifebar.png'),
                            url('/img/tower/tower_ui_lifebar_bg.png');
                        background-size:
                            var(--full-width) var(--full-height),
                            calc(var(--current-percentage) * var(--bar-scalar)) 95%;
                        background-position:
                            center center,
                            left center;
                        background-repeat:
                            no-repeat,
                            no-repeat;

                        background-position-x:
                            0px,
                            calc((var(--full-width) - (var(--full-width) * var(--bar-scalar))) / 2);

                        div.tower-stats-enemy-hp {
                            text-align: center;
                            font-size: 14px;
                            line-height: 16px;
                            position: relative;
                            top: -1px;
                        }
                    }

                }
            }
        }
        #tower-stats-queue-too-big {
            font-size: 16px;
            position: relative;
            left: 0.5px;
            text-align: center;
            width: 100%;
            overflow: hidden;
            color: var(--color-danger-text);
            transition: height 1s ease;
            height: 0px;

            &.too-big {
                height: 40px;
            }
        }
        #tower-stats-loot-list {
            --mask-height: 24px;
            --internal-offset: 0.01;
            --base-width: 360px;
            --cut-sides: calc(var(--base-width) - (var(--base-width) * var(--internal-offset)));
            --width: round(down, var(--cut-sides), 1px);
            --left: round(up, calc((var(--base-width) - var(--width)) / 2), 1px);

            --scrollbar-handle-r: calc((255 + 249)/2);
            --scrollbar-handle-g: calc((229 + 165)/2);
            --scrollbar-handle-b: calc((0 + 0)/2);
            --scrollbar-base-r: 255;
            --scrollbar-base-g: 0;
            --scrollbar-base-b: 88;

            display: flex;
            flex-direction: column;
            margin: 0;
            margin-right: calc(212px - var(--width) + 32px);
            padding: 0;

            overflow-y: scroll;
            scrollbar-width: thin;
            scrollbar-color: rgba(var(--scrollbar-handle-r), var(--scrollbar-handle-g), var(--scrollbar-handle-b), 0.75) rgba(var(--scrollbar-base-r), var(--scrollbar-base-g), var(--scrollbar-base-b), 0.525);

            position: relative;
            width: var(--width);
            left: var(--left);
            max-height: 360px;
            min-height: 360px;
            padding-left: 8px;

            /* put scrollbar on left side */

            direction: rtl;
            * {
                direction: ltr;
            }

            .tower-stats-loot-list-item-header {
                display: flex;
                flex-direction: row;
                justify-content: flex-start;
                align-items: center;
                gap: 6px;
                margin: 0;
                padding: 0;

                .tower-stats-loot-list-enemy-image {
                    position: relative;
                    max-width: 28px;
                    max-height: 28px;
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center center;
                    min-width: 28px;
                    min-height: 28px;
                    image-rendering: auto;
                }
                div {
                    font-size: 24px;
                }
            }
            div.tower-stats-loot-list-item {
                display: flex;
                flex-direction: row;
                justify-content: flex-start;
                align-items: center;
                gap: 6px;
                margin: 0;
                padding: 0;
                padding-left: 8px;

                div.tower-stats-loot-list-item-image {
                    min-height: 20px;
                    min-width: 20px;
                    max-width: 20px;
                    max-height: 20px;
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center center;
                    image-rendering: auto;
                }

                div.tower-stats-loot-list-item-name {
                    font-size: 16px;
                }
            }
        }
        #tower-stats-loot-list .tower-stats-loot-list-item-header:not(:first-child) {
            margin-top: 8px;
        }
        div.tower-stats-upcoming-mob {
            overflow: visible;
            pointer-events: none;
            position: relative;
            display: block;
            width: 0px;
            height: 0px;

            padding: 0;
            margin: 0;
            margin-top: -10px; /* offsets gap in parent flexbox */

            --mob-base-top: 55px;
            --mob-base-left: -110px;
            --mob-base-opacity: 0.0;
            --mob-base-width: 218px;
            --mob-base-height: 218px;

            --mob-1-top: 64px;
            --mob-1-left: 26px;
            --mob-1-opacity: 0.8;
            --mob-1-width: 200px;
            --mob-1-height: 200px;

            --mob-2-top: 50px;
            --mob-2-left: 100px;
            --mob-2-opacity: 0.6;
            --mob-2-width: 174px;
            --mob-2-height: 174px;

            --mob-3-top: 40px;
            --mob-3-left: 150px;
            --mob-3-opacity: 0.4;
            --mob-3-width: 160px;
            --mob-3-height: 160px;

            --mob-4-top: 30px;
            --mob-4-left: 190px;
            --mob-4-opacity: 0.2;
            --mob-4-width: 150px;
            --mob-4-height: 150px;

            --mob-5-top: 10px;
            --mob-5-left: 220px;
            --mob-5-opacity: 0.0;
            --mob-5-width: 140px;
            --mob-5-height: 140px;

            --transition-time: 0.0s;
            --transition-offset: 0.0s;
            --transition-offset-stagger: 0.25s;

            transition:
                top var(--transition-time) ease-in-out var(--transition-offset),
                left var(--transition-time) ease-in-out var(--transition-offset),
                opacity var(--transition-time) ease-in-out var(--transition-offset);

            div.tower-stats-upcoming-mob-image-wrapper {
                background-repeat: no-repeat;
                background-position: center center;
                background-size: contain;

                transition:
                    width var(--transition-time) ease-in-out var(--transition-offset),
                    height var(--transition-time) ease-in-out var(--transition-offset);

                &.clone {
                    filter: grayscale(100%);
                }
            }

            &.moving-forward {
                --transition-time: 0.5s;
            }

            &#tower-stats-upcoming-mob-1 {
                top: var(--mob-1-top);
                left: var(--mob-1-left);
                opacity: var(--mob-1-opacity);

                div.tower-stats-upcoming-mob-image-wrapper {
                    width: var(--mob-1-width);
                    height: var(--mob-1-height);
                }

                &.moving-forward {
                    top: var(--mob-base-top);
                    left: var(--mob-base-left);
                    opacity: var(--mob-base-opacity);

                    div.tower-stats-upcoming-mob-image-wrapper {
                        width: var(--mob-base-width);
                        height: var(--mob-base-height);
                    }
                }
            }

            &#tower-stats-upcoming-mob-2 {
                top: var(--mob-2-top);
                left: var(--mob-2-left);
                opacity: var(--mob-2-opacity);

                div.tower-stats-upcoming-mob-image-wrapper {
                    width: var(--mob-2-width);
                    height: var(--mob-2-height);
                }

                &.moving-forward {
                    --transition-offset: calc(var(--transition-offset-stagger) * 1);

                    top: var(--mob-1-top);
                    left: var(--mob-1-left);
                    opacity: var(--mob-1-opacity);

                    div.tower-stats-upcoming-mob-image-wrapper {
                        width: var(--mob-1-width);
                        height: var(--mob-1-height);
                    }
                }
            }

            &#tower-stats-upcoming-mob-3 {
                top: var(--mob-3-top);
                left: var(--mob-3-left);
                opacity: var(--mob-3-opacity);

                div.tower-stats-upcoming-mob-image-wrapper {
                    width: var(--mob-3-width);
                    height: var(--mob-3-height);
                }

                &.moving-forward {
                    --transition-offset: calc(var(--transition-offset-stagger) * 2);

                    top: var(--mob-2-top);
                    left: var(--mob-2-left);
                    opacity: var(--mob-2-opacity);

                    div.tower-stats-upcoming-mob-image-wrapper {
                        width: var(--mob-2-width);
                        height: var(--mob-2-height);
                    }
                }
            }

            &#tower-stats-upcoming-mob-4 {
                top: var(--mob-4-top);
                left: var(--mob-4-left);
                opacity: var(--mob-4-opacity);

                div.tower-stats-upcoming-mob-image-wrapper {
                    width: var(--mob-4-width);
                    height: var(--mob-4-height);
                }

                &.moving-forward {
                    --transition-offset: calc(var(--transition-offset-stagger) * 3);

                    top: var(--mob-3-top);
                    left: var(--mob-3-left);
                    opacity: var(--mob-3-opacity);

                    div.tower-stats-upcoming-mob-image-wrapper {
                        width: var(--mob-3-width);
                        height: var(--mob-3-height);
                    }
                }
            }

            &#tower-stats-upcoming-mob-5 {
                top: var(--mob-5-top);
                left: var(--mob-5-left);
                opacity: var(--mob-5-opacity);

                div.tower-stats-upcoming-mob-image-wrapper {
                    width: var(--mob-5-width);
                    height: var(--mob-5-height);
                }

                &.moving-forward {
                    --transition-offset: calc(var(--transition-offset-stagger) * 4);

                    top: var(--mob-4-top);
                    left: var(--mob-4-left);
                    opacity: var(--mob-4-opacity);

                    div.tower-stats-upcoming-mob-image-wrapper {
                        width: var(--mob-4-width);
                        height: var(--mob-4-height);
                    }
                }
            }
        }
        div[class*="tower_tuiMobPortrait"]
        div[class*="tower_portraitImageContainer"]
        img[class*="tower_portraitImage"]
        .tower-stats-enemy-image-clone {
            filter: grayscale(100%);
        }
        @keyframes adjust-masks {
            0% {
                mask-size: 100% 0px, 100% calc(100% - var(--mask-height)), 100% var(--mask-height);
                -webkit-mask-size: 100% 0px, 100% calc(100% - var(--mask-height)), 100% var(--mask-height);
                mask-position: top center, center 0px, bottom center;
                -webkit-mask-position: top center, center 0px, bottom center;
            }
            10% , 90% {
                mask-size: 100% var(--mask-height), 100% calc(100% - var(--mask-height) - var(--mask-height)), 100% var(--mask-height);
                -webkit-mask-size: 100% var(--mask-height), 100% calc(100% - var(--mask-height) - var(--mask-height)), 100% var(--mask-height);
                mask-position: top center, center var(--mask-height), bottom center;
                -webkit-mask-position: top center, center var(--mask-height), bottom center;
            }
            100% {
                mask-size: 100% var(--mask-height), 100% calc(100% - var(--mask-height)), 100% 0px;
                -webkit-mask-size: 100% var(--mask-height), 100% calc(100% - var(--mask-height)), 100% 0px;
                mask-position: top center, center var(--mask-height), bottom center;
                -webkit-mask-position: top center, center var(--mask-height), bottom center;
            }
        }
    `;

    // keep data between runs
    const CACHE = {
        ensure() {
            if (Object.hasOwn(window, CACHE_KEY)) {
                return window[CACHE_KEY];
            }
            window[CACHE_KEY] = {};
            return window[CACHE_KEY];
        },
        get(key) {
            const cache = this.ensure();
            return Object.hasOwn(cache, key) ? cache[key] : null;
        },
        set(key, value) {
            this.ensure()[key] = value;
        },
        assign(key, source) {
            let target = this.get(key);
            if (target === null) {
                target = {};
                this.set(key, target);
            }
            Object.assign(target, source);
        },
        stringify(...keys) {
            const trailing = keys.map(key => `['${key}']`).join('');
            return `window['${CACHE_KEY}']${trailing}`;
        },
    };

    const delay = callback => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                callback();
            });
        });
    }

    // save current state to localstorage
    const localstorage_save = () => {
        if (!instance.is_current()) return false;
        try {
            const saved = {};
            for (const key of SAVED_LOCALSTORAGE_OBJECTS) {
                const data = CACHE.get(key);
                saved[key] = key === 'user_combat_items' && data !== null ? { items: data['items'] } : data;
            }
            localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(saved));
            return true;
        } catch (err) {
            console.warn('Could not save tower tracking:', err);
            return false;
        }
    };

    // restore state from localStorage
    const localstorage_restore = () => {
        try {
            const json = localStorage.getItem(LOCALSTORAGE_KEY);
            if (json === null) return false;
            const saved = JSON.parse(json);
            if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return false;
            const cache = CACHE.ensure();
            for (const key of SAVED_LOCALSTORAGE_OBJECTS) {
                if (Object.hasOwn(cache, key) || !Object.hasOwn(saved, key)) continue;
                const data = saved[key];
                if (key === 'user_combat_items') {
                    if (Array.isArray(data?.['items'])) CACHE.set(key, create_user_combat_items(data['items']));
                } else if (data === null || (typeof data === 'object' && !Array.isArray(data))) {
                    CACHE.set(key, data);
                }
            }
            return true;
        } catch (err) {
            console.warn('Could not restore tower tracking:', err);
            return false;
        }
    };

    const initalized = () => instance.is_current() && CACHE.get('initalized') === true;

    // if upgrading with existing loot
    const UNKNOWN_LOOT_ENEMY = {
        name: 'Unknown',
        image: 'https://dogonline.net/img/wiggle-icon-question-mark.gif',
    };

    const get_enemy_loot = (stats, enemy) => {
        if (typeof enemy?.name !== 'string' || !enemy.name || typeof enemy?.image !== 'string' || !enemy.image) enemy = UNKNOWN_LOOT_ENEMY;
        let group = stats.loot.find(entry => entry.name === enemy.name && entry.image === enemy.image);
        if (!group) {
            group = { name: enemy.name, image: enemy.image, count: 0, time: 0, loot: [] };
            stats.loot.push(group);
        }
        return group;
    };

    // filling in missing session values was because i didn't want
    // to re-queue a bunch of enemies while writing this lol. it
    // should never actually be relevant unless you go in and edit
    // your localStorage data manually
    const get_session_stats = () => {
        const cached = CACHE.get('session_stats');
        if (cached === null || typeof cached !== 'object' || Array.isArray(cached)) {
            CACHE.set('session_stats', {});
        }
        const stats = CACHE.get('session_stats');
        if (!Number.isSafeInteger(stats.slain) || stats.slain < 0) stats.slain = 0;
        if (!Array.isArray(stats.loot)) stats.loot = [];

        // convert existing loot to the tracked type in v5
        const legacy = stats.loot.filter(entry => !Array.isArray(entry?.loot));
        if (legacy.length > 0 || (stats.loot.length === 0 && stats.slain > 0)) {
            stats.loot = stats.loot.filter(entry => Array.isArray(entry?.loot));
            const known = stats.loot.reduce((count, group) => count + (Number.isSafeInteger(group.count) && group.count > 0 ? group.count : 0), 0);
            const unknown = get_enemy_loot(stats, UNKNOWN_LOOT_ENEMY);
            unknown.count += Math.max(0, stats.slain - known);
            for (const item of legacy) {
                if (typeof item?.name !== 'string' || typeof item?.image !== 'string') continue;
                const count = Number.isSafeInteger(item.count) && item.count > 0 ? item.count : 1;
                const time = Number.isFinite(item.time) ? item.time : 0;
                const existing = unknown.loot.find(entry => entry.name === item.name && entry.image === item.image);
                if (existing) {
                    existing.count += count;
                    existing.time = Math.max(existing.time ?? 0, time);
                } else unknown.loot.push({ name: item.name, image: item.image, count, time });
            }
        }
        for (const group of stats.loot) {
            if (!Number.isSafeInteger(group.count) || group.count < 0) group.count = 0;
            if (!Number.isFinite(group.time)) group.time = 0;
            for (const item of group.loot) {
                if (!Number.isFinite(item.time)) item.time = 0;
                group.time = Math.max(group.time, item.time);
            }
            group.loot.sort((a, b) => b.time - a.time);
        }
        stats.loot.sort((a, b) => b.time - a.time);
        if (!stats.loot_enemy || typeof stats.loot_enemy !== 'object' || Array.isArray(stats.loot_enemy)) stats.loot_enemy = null;

        return stats;
    };

    const chest_name_from_image = extracted => {
        const lower = extracted?.toLocaleLowerCase() ?? null;
        if (lower === null) return '';
        if (lower.includes('treasure')) return 'Treasure';
        if (lower.includes('slime')) return 'Slop';
        if (lower.includes('books')) return 'Bookshelf';
        if (lower.includes('cooler')) return 'Cooler';
        return lower.charAt(0) + lower.substring(1); // fallback
    }

    // for non-enemy enounter related loot drops
    const get_loot_event = (ui, previous, coordinates) => {
        const image = ui?.eventPortrait?.image ?? '';
        const visible = ui?.eventPortrait?.visible === true && ui?.mobPortrait?.visible !== true;
        const word = chest_name_from_image(image_name_extraction(image));
        let name = visible && word ? word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase() : null;
        const text = [ui?.textStatic, ui?.textbox]
            .filter(field => field?.visible === true && typeof field.text === 'string')
            .map(field => field.text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' '))
            .join(' ').replace(/\s+/g, ' ').trim();
        const tilekey = get_tile_key(coordinates);
        const enormous = /\bABSOLUTELY\s+ENOU?RMOUS\b/i.test(text); // in case they fix the spelling in the future lol
        // please cover all cases ....... if it doesn't it should at least show up under "Unknown" (which can be bug reported)
        const encounter_prompt = /\byou\s+(?:find|found|stumble\s+upon)\s+an?\s+[^.!?]*\b(?:treasure|chest)\b/i.test(text);
        const location = tilekey !== null ? coordinates : previous?.event?.visible && !encounter_prompt && !enormous
            ? previous.event.coordinates ?? previous.coordinates : null;
        if (name === 'Treasure') {
            const previous_tilekey = get_tile_key(previous?.event?.coordinates ?? previous?.coordinates);
            const continuing = previous?.event?.visible && previous.event.name === 'Enormous Treasure' && (
                tilekey === null || previous_tilekey === null || tilekey === previous_tilekey
            );
            if (enormous || (continuing && !encounter_prompt)) name = 'Enormous Treasure';
        }
        return { name, image, visible, text, coordinates: { ...location } };
    };

    // add each new loot drop to saved loot data
    const process_loot_drop = loot => {
        const stats = get_session_stats();
        if (Array.isArray(loot) && loot.length === 0) {
            if (stats.loot_enemy?.received) stats.loot_enemy = null;
            return;
        }
        const items = (Array.isArray(loot) ? loot : []).filter(item => typeof item?.name === 'string' && typeof item?.image === 'string');
        if (items.length === 0) return;
        const state = CACHE.get('state');
        const prev = CACHE.get('prev');
        const tilekey = get_tile_key(state?.coordinates);
        const event = state?.event;
        const event_enemy = event?.visible && event.name ? {
            name: event.name,
            image: event.image,
        } : null;
        let enemy = event_enemy ?? stats.loot_enemy;
        if (!event_enemy && enemy && tilekey !== null && get_tile_key(enemy.coordinates) !== tilekey) enemy = null;
        if (!enemy) {
            enemy = [prev, state].find(entry => entry?.mob?.hp === 0 && entry.mob.name && entry.mob.image && (
                tilekey === null || get_tile_key(entry.coordinates) === tilekey
            ))?.mob;
        }
        const group = get_enemy_loot(stats, enemy);
        if (event_enemy) {
            group.count++;
            stats.loot_enemy = null;
        }
        const time = Math.max(Date.now(), ...stats.loot.map(entry => entry.time + 1));
        for (const item of items) {
            const existing = group.loot.find(entry => entry.name === item.name && entry.image === item.image);
            if (existing) {
                existing.count++;
                existing.time = time;
            }
            else {
                group.loot.push({ image: item.image, name: item.name, count: 1, time });
            }
        }
        group.time = time;
        if (enemy === stats.loot_enemy && enemy) enemy.received = true;
    };

    // extract the image name from a url
    const image_name_extraction = url => {
        if (typeof url !== 'string') return null;
        return /(?:^|\/)([^/?#]+)\.(?:png|gif|jpe?g|bmp)(?:[?#].*)?$/i.exec(url)?.[1] ?? null;
    };

    // turn an image name into actual words (estimation of non-named things)
    const image_to_name = url => {
        const extracted = image_name_extraction(url);
        if (extracted === null) return null;
        return extracted
            .toLocaleLowerCase()
            .split(/[-_\s]+/)
            .filter(word => word.length > 0 && word !== 'enemy')
            .map(word => `${word.charAt(0).toLocaleUpperCase()}${word.substring(1)}`)
            .join(' ');
    };

    const patch_console_logging = () => {
        // uses browser text colors
        const CSS = {
            reset: '',
            bg: {
                black: 'background-color: black;',
            },
            fg: {
                white: 'color: #fff;',
                grey: 'color: #999;',
                red: 'color: #f00;',
                cyan: 'color: #0ff;',
                pale: 'color: #aff;',
                orange: 'color: #d90;',
            },
        };
        const prepend = (label, color) => [`%c[${label}]%c `, `${CSS.bg.black}${color}`, CSS.reset];
        const levels = [
            { source: 'everything', target: 'log', get indicator() { return prepend(this.source, CSS.fg.grey) } },
            { source: 'notice', target: 'log', get indicator() { return prepend(this.source, CSS.fg.white) } },
            { source: 'info', target: 'log', get indicator() { return prepend(this.source, CSS.fg.cyan) } },
            { source: 'log', target: 'log', get indicator() { return [] } }, // leave page logs unchanged
            { source: 'warn', target: 'warn', get indicator() { return prepend(this.source, CSS.fg.orange) } },
            { source: 'error', target: 'error', get indicator() { return prepend(this.source, CSS.fg.red) } },
            { source: 'override', target: 'log', get indicator() { return prepend(this.source, CSS.fg.cyan) } },
        ];
        if (CACHE.get('logging') === null) {
            CACHE.set('logging', {});
        }
        const logging = CACHE.get('logging');
        const original = {
            log: logging.log ?? logging.everything ?? console.log,
            warn: logging.warn ?? console.warn,
            error: logging.error ?? console.error,
        };
        const logging_level = levels.findIndex(level => level.source === LOGGING_LEVEL);
        for (const [index, level] of levels.entries()) {
            const { source, target, indicator } = level;
            if (logging[source] === undefined) {
                CACHE.assign('logging', { [source]: original[target] });
            }
            if (source === 'log') {
                console[source] = logging[source];
                continue;
            }
            console[source] = function (...args) {
                if (index < logging_level) return;
                const [format, style, reset] = indicator;
                const formatted = typeof args[0] === 'string'
                    ? [`${format}${args[0]}`, style, reset, ...args.slice(1)]
                    : [format, style, reset, ...args];
                return logging[source].apply(console, formatted);
            };
            console.everything(`Console logging patched: <console.${source}> \u2192 <console.${target}>`);
        }
    };

    // find current player tile
    const get_current_tile = map => {
        for (const y in map ?? []) {
            for (const x in map[y]) {
                const cell = map[y][x];
                if (typeof cell === 'string' && /^\/img.*player\.gif/.test(cell)) {
                    return { x: parseInt(x, 10), y: parseInt(y, 10) };
                }
            }
        }
        return { x: null, y: null };
    };

    // return current tile as string for keying
    const get_tile_key = coordinates => {
        if (!Number.isInteger(coordinates?.['x']) || !Number.isInteger(coordinates?.['y'])) return null;
        return `tile-${coordinates.x}-${coordinates.y}`;
    };

    // read tower state
    const update_window_state_from_tower_state_raw = () => {
        const raw = CACHE.get('tower_state_raw');
        if (raw === null) return null;
        const active = raw['active'] ?? (raw['state'] === 'active');
        if (active !== true) {
            clear_tower_tracking();
            mob_queue_info_update();
            return null;
        }
        const ui = raw['ui'];
        const current_tile = get_current_tile(ui?.['map']?.['images']);
        const mob = {
            damage: ui?.['mobDamageNumber'],
            status: ui?.['mobPortrait'],
        };
        const equips = ui?.['combatItems'];
        const state = {
            active,
            coordinates: current_tile,
            event: get_loot_event(ui, CACHE.get('state'), current_tile),
            mob: {
                name: image_to_name(mob.status?.['image']),
                image: mob.status?.['image'],
                last_dealt: mob.damage?.['hp'] ?? null,
                hp: mob.status?.['hp'] ?? null,
                maxHp: mob.status?.['maxHp'] ?? null,
                visible: mob.status?.['visible'] ?? false,
            },
            equips: [
                equips?.['cell1']?.['image'] ?? null,
                equips?.['cell2']?.['image'] ?? null,
                equips?.['cell3']?.['image'] ?? null,
                equips?.['cell4']?.['image'] ?? null,
            ].map(image_name_extraction),
            loot: ui?.['lootDisplay']?.['items'],
            resolving_weapon_use: equips?.['disabled'] === true,
        };
        // keep prev state separate
        CACHE.set('prev', structuredClone(CACHE.get('state')));
        CACHE.assign('state', state);
        if (typeof CACHE.get('equip') !== 'function') {
            CACHE.set('equip', turn => CACHE.get('user_combat_items')?.['find'](turn) ?? null);
        }
        return CACHE.get('state');
    };

    // create an item-lookup object given a user's inventory items
    const create_user_combat_items = items => ({
        items,
        find(turn) {
            const state = CACHE.get('state');
            if (state === null) return null;
            const index = /^use-item-([1-4])$/.exec(turn)?.[1];
            if (index === undefined) return null;
            const equip = state['equips']?.[Number(index) - 1];
            if (equip == null) return null;
            return this.items.find(item => equip === item?.image) ?? null;
        },
    });

    // we only care about combat items (from their category)
    const update_user_combat_items_from_response = async response => {
        const revision = tower_revision;
        const json = await response.json();
        if (!instance.is_current() || revision !== tower_revision) return;
        const inventory = json?.[0]?.['result']?.['data']?.['json']?.['inventory'];
        if (!Array.isArray(inventory)) throw new Error('Invalid inventory response!');
        const items = inventory.filter(item => item?.['categories']?.includes('combat')).map(item => ({
            id: item.id,
            name: item.name,
            image: image_name_extraction(item.image),
        }));
        CACHE.set('user_combat_items', create_user_combat_items(items));
    };

    // request setup
    const get_response_from_url = async url => {
        const qs = new URLSearchParams({
            batch: '1',
            input: JSON.stringify({
                '0': {
                    json: null,
                    meta: {
                        values: ['undefined'],
                        v: 1,
                    },
                },
            }),
        }).toString();
        const request = {
            url: `${url}?${qs}`,
            body: {
                method: 'GET',
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            },
        };
        try {
            const response = await CACHE.get('original_fetch').call(window, request.url, request.body);
            if (!response.ok) {
                throw new Error(`Error fetching data! Status: ${response.status}`);
            }
            return response;
        } catch (err) {
            throw new Error('Failed while attempting to fetch!', { cause: err });
        }
    };

    const get_dogonline_style = indicator => {
        const next = document.getElementById('__next');
        const element = document.querySelector(`[class^="${indicator}"], [class*=" ${indicator}"]`);
        if (element === null) return null;
        const full = [...element.classList].find(which => which.startsWith(indicator));
        if (full === undefined) return null;
        return full;
    }

    const reorder_tower_options_start_to_top = () => {
        if (document.getElementById('tower-otions-restyling-order') !== null) return;
        const tower_options_reorder_style = `
            .${get_dogonline_style('tower_towerOptions__')} {
                display: flex !important;
                flex-direction: column !important;
                & > * { order: 2 !important; }
                & > .${get_dogonline_style('tower_destinationContainer__')},
                & > .${get_dogonline_style('tower_enterTowerBtns__')} { order: 1 !important; }
            }
        `;

        const style = document.createElement('style');
        style.id = 'tower-otions-restyling-order';
        style.textContent = tower_options_reorder_style;
        document.head.appendChild(style);
    }

    const get_user_items_and_store_in_window = async () => {
        const revision = tower_revision;
        const cached = CACHE.get('user_combat_items');
        if (Array.isArray(cached?.['items'])) {
            if (typeof cached['find'] !== 'function') CACHE.set('user_combat_items', create_user_combat_items(cached['items']));
            return;
        }
        const url = 'https://dogonline.net/api/trpc/doghouse.getState';
        const response = await get_response_from_url(url);
        if (!instance.is_current() || revision !== tower_revision) return;
        await update_user_combat_items_from_response(response);
    };

    // save tower state
    const update_raw_tower_state_from_response = (response, already_decoded = false, index = 0) => {
        if (!instance.is_current()) return false;
        if (!already_decoded) {
            return response.json().then(json => update_raw_tower_state_from_response(json, true, index));
        }
        const json = response;
        const entry = Array.isArray(json) ? json[index] : (index === 0 ? json : null);
        const data = entry?.['result']?.['data']?.['json'];
        if (!data || typeof data !== 'object' || (
            typeof data['active'] !== 'boolean' &&
            typeof data['state'] !== 'string'
        )) return false;
        CACHE.set('tower_state_raw', data);
        update_window_state_from_tower_state_raw();
        return true;
    };

    const get_tower_state_when_running_script_for_first_time = async () => {
        // check saved runs against server
        const revision = tower_revision;
        const url = 'https://dogonline.net/api/trpc/tower.getState';
        const response = await get_response_from_url(url);
        process_deferred_response(await response.json(), [0], [], 0, revision);
    };

    // keep minimal queue enemy data
    const copy_enemy = enemy => ({
        name: enemy.name,
        image: enemy.image,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        clone: enemy?.clone ?? false,
    });

    // keep track of enemy maxHp
    const remember_original_enemy_hp = (enemy, hp = enemy?.['maxHp']) => {
        if (!enemy?.['name']) return null;
        const cached = CACHE.get('original_enemy_hp')?.[enemy.name];
        if (Number.isFinite(cached) && cached > 0) return cached;
        if (!Number.isFinite(hp) || hp <= 0) return null;
        CACHE.assign('original_enemy_hp', { [enemy.name]: hp });
        return hp;
    };

    // create a weapon usage object for the currently attacked enemy
    const create_weapon_use = (item, request_id = 0, state = CACHE.get('state')) => ({
        item,
        enemy: state?.['mob'] ? copy_enemy(state['mob']) : null,
        coordinates: { ...state?.['coordinates'] },
        request_id,
        revision: tower_revision,
        resolving: false,
        effects: { split: false, banish: false, donut: false, removed: false },
    });

    // track the user's chosen weapon
    const use_combat_weapon = (weapon, request_id = 0, on_cooldown = false) => {
        if (!initalized() || weapon == null) return null;
        if (!on_cooldown && CACHE.get('state')?.['resolving_weapon_use']) return pending_weapon_use;
        pending_weapon_use = create_weapon_use(on_cooldown ? null : weapon, request_id);
        CACHE.assign('tracking', { pending: pending_weapon_use.item });
        return pending_weapon_use;
    };

    // match server responses to weapon use
    const get_weapon_use = (turns, index, request_id) => {
        const turn = turns?.find(turn => turn.index === index);
        let action = turn?.action ?? null;
        if (action === null && turn?.item) {
            action = pending_weapon_use?.item === turn.item && (
                request_id === 0 || pending_weapon_use.request_id === request_id
            ) ? pending_weapon_use : create_weapon_use(turn.item, request_id);
        }
        if (action === null && pending_weapon_use && (
            request_id === 0 || request_id >= pending_weapon_use.request_id
        )) action = pending_weapon_use;
        if (action === null && turns === null && CACHE.get('tracking')?.['pending']) {
            action = create_weapon_use(CACHE.get('tracking')['pending'], request_id);
        }
        return action?.revision === tower_revision ? action : null;
    };

    const is_weapon_on_cooldown = (
        weapon_index,
        combat_items = CACHE.get('tower_state_raw')?.['ui']?.['combatItems']
    ) => (combat_items?.[`cell${weapon_index}`]?.['cooldownTurnsLeft'] ?? 0) > 0;

    // keep each tile queue separate from one another
    const get_queue = (coordinates = CACHE.get('state')?.['coordinates']) => {
        const tilekey = get_tile_key(coordinates);
        if (tilekey === null) return null;
        setup_enemy_queue();
        const queues = CACHE.get('enemy_queue');
        if (!Array.isArray(queues[tilekey])) queues[tilekey] = [];
        return queues[tilekey];
    };

    const front_of_current_queue = () => get_queue()?.[0];

    // add the split enemy from scythe into the back of the queue
    const add_split_enemy_to_back_of_queue = (enemy = CACHE.get('state')?.['mob'], coordinates = CACHE.get('state')?.['coordinates']) => {
        const queue = get_queue(coordinates);
        if (!queue || !enemy) return;
        queue.push({ ...copy_enemy(enemy), hp: enemy.maxHp, clone: true });
    };

    // remove only the front-most enemy (banished or defeated)
    const remove_enemy_from_front_of_queue = (coordinates = CACHE.get('state')?.['coordinates']) => get_queue(coordinates)?.shift() ?? null;

    // mark an enemy at the front of the queue as pending removal
    const mark_enemy_removal_pending = (banished = false) => {
        const pending = CACHE.get('removal_pending');
        if (pending === null) CACHE.set('removal_pending', { banished });
        else if (banished) pending.banished = true;
        CACHE.assign('tracking', { waiting_for_next_enemy: true });
    };

    // remove the enemy from the front of the queue after the encounter advances
    const complete_pending_removal = () => {
        const pending = CACHE.get('removal_pending');
        const state = CACHE.get('state');
        if (pending === null || state === null) return false;
        const mob = state['mob'];
        const ready = !mob['visible'] || (pending.banished ? !state['resolving_weapon_use'] : mob['hp'] > 0);
        if (!ready) return false;
        const coordinates = get_tile_key(state['coordinates']) === null
            ? CACHE.get('prev')?.['coordinates']
            : state['coordinates'];
        const queue = get_queue(coordinates);
        if (queue === null) return false;
        if (remove_enemy_from_front_of_queue(coordinates) !== null) upcoming_mob_revision++;
        CACHE.set('removal_pending', null);
        return true;
    };

    // update the current enemy in the enemy queue given the reported enemy data
    const update_current_enemy_in_queue = (name, image, hp, maxHp, clone = null, coordinates = CACHE.get('state')?.['coordinates']) => {
        const queue = get_queue(coordinates);
        if (!queue) return;
        const enemy = { name, image, hp, maxHp, clone: clone ?? false };
        if (queue.length === 0) queue.push(enemy);
        else Object.assign(queue[0], { ...enemy, clone: clone ?? queue[0]['clone'] });
    };

    // convert queues on every tile to a banished enemy
    const banish_conversion_entire_queue = (target = pending_weapon_use?.enemy ?? CACHE.get('prev')?.['mob'] ?? front_of_current_queue()) => {
        const target_hp = remember_original_enemy_hp(target);
        if (target_hp === null) return false;
        const queues = CACHE.get('enemy_queue') ?? {};
        const keys = Object.keys(queues);
        if (!CACHE.get('user_options')?.['dogmaticseal']) {
            // remove all enemies in all queues of enemy that got banished
            // (except front of current queue, which is pending removal)
            for (const key of keys) {
                const queue = queues[key];
                if (!Array.isArray(queue)) continue;
                queues[key] = queue.filter(enemy => enemy === front_of_current_queue() || enemy.name !== target.name);
            }
        } else {
            // convert all enemies in all queues of enemy that got banished
            for (const key of keys) {
                const queue = queues[key];
                if (!Array.isArray(queue)) continue;
                for (const enemy of queue) {
                    if (enemy.name !== target.name) {
                        // note: converted enemies from banish lose their clone status
                        Object.assign(enemy, { name: target.name, image: target.image, hp: target_hp, maxHp: target_hp, clone: false });
                    }
                }
            }
        }
        return true;
    };

    // check for the actual banish message
    const enemy_was_banished = () => {
        const ui = CACHE.get('tower_state_raw')?.['ui'];
        return [ui?.['textbox'], ui?.['textStatic']].some(field => {
            if (field?.['visible'] === false || typeof field?.['text'] !== 'string') return false;
            const text = field['text'].replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ');
            return /\benemy\s+?was\s+?banished\b/i.test(text);
        });
    };

    // yeah it's a long function name
    const check_and_remove_enemy_death_animation_to_remove_grayscale_death_animation_if_no_longer_clone = () => {
        const selector = 'div[class*="tower_tuiMobPortrait"] div[class*="tower_portraitImageContainer"] img[class*="tower_portraitImage"]';
        const portrait = document.querySelector(selector);
        const is_clone = (
            CACHE.get('state')?.['mob']?.['visible'] === true &&
            front_of_current_queue()?.['clone'] === true
        );

        if (portrait !== null && !is_clone) {
            const animation = window.getComputedStyle(portrait).animation;
            if (animation.includes('enemy-death')) {
                // remove stuck death animation from portrait if no longer clone
                portrait.style.animation = '';
            }
        }
    }

    // forces the enemy that we are currently fighting to always be grayscale if it is a clone...
    // this "fixes" a bug where certain enemy animations lose the cloned grayscale look.
    // just a little qol and to fix a thing that has been bothering me for a while.
    const update_current_mob_grayscale_animation = () => {
        const selector = 'div[class*="tower_tuiMobPortrait"] div[class*="tower_portraitImageContainer"] img[class*="tower_portraitImage"]';
        const portrait = document.querySelector(selector);
        const is_clone = (
            CACHE.get('state')?.['mob']?.['visible'] === true &&
            front_of_current_queue()?.['clone'] === true
        );

        if (portrait !== null && portrait.classList.contains('tower-stats-enemy-image-clone') !== is_clone) {
            portrait.classList.toggle('tower-stats-enemy-image-clone', is_clone);
        }

        let grayscale = CACHE.get('clone_grayscale');

        if (grayscale !== null && ((!is_clone || grayscale.effect?.target) !== portrait)
        ) {
            // clear existing grayscale "animation" if the enemy is not a clone
            grayscale.cancel();
            CACHE.set('clone_grayscale', null);
            grayscale = null;
        }

        if (portrait !== null && is_clone && grayscale === null) {
            // "play" the grayscale "animation" if the enemy is a clone
            grayscale = portrait.animate(
                { filter: ['grayscale(100%)', 'grayscale(100%)'] },
                { duration: 1, fill: 'both', composite: 'add' }
            );
            grayscale.pause();
            grayscale.currentTime = 0;
            CACHE.set('clone_grayscale', grayscale);
        }
    }

    // update queues from observed changes
    const process_enemy_change = (item = CACHE.get('tracking')?.['pending'] ?? null, action = null) => {
        // yeah this one is a beast...
        const state = CACHE.get('state');
        if (!state?.['active']) return;
        const prev_state = CACHE.get('prev');
        const prev = prev_state?.['mob'];
        const curr = state['mob'];
        const tilekey = get_tile_key(state['coordinates']);
        const same_tile = (
            tilekey !== null &&
            tilekey === get_tile_key(prev_state?.['coordinates'])
        );
        const advanced = complete_pending_removal();
        const same_enemy = (
            !advanced &&
            same_tile &&
            prev?.['name'] === curr['name']
        );
        const noncombat_event = CACHE.get('tower_state_raw')?.ui?.eventPortrait?.visible === true && !curr['visible'];
        const died = (
            !noncombat_event &&
            !advanced &&
            same_tile &&
            prev?.['hp'] > 0 &&
            curr['hp'] === 0
        );
        const queue = (tilekey === null) ? null : get_queue();

        if (
            prev?.['visible'] &&
            prev['hp'] > 0
        ) {
            remember_original_enemy_hp(prev);
        }

        if (
            !advanced &&
            same_tile &&
            queue.length === 0 &&
            prev?.['visible'] &&
            prev['hp'] > 0
        ) {
            queue.push(copy_enemy(prev));
        }

        action ??= item === null ? null : create_weapon_use(item, 0, prev_state ?? state);
        const effects = action?.effects;
        const weapon = item?.['name'] ?? null;
        const finished = !state['resolving_weapon_use'];
        const hp_decreased = (
            same_enemy &&
            Number.isFinite(prev['hp']) &&
            Number.isFinite(curr['hp']) &&
            prev['hp'] > 0 &&
            prev['hp'] > curr['hp']
        );
        const max_hp_decreased = (
            same_enemy &&
            prev['hp'] > 0 &&
            Number.isFinite(prev['maxHp']) &&
            Number.isFinite(curr['maxHp']) &&
            curr['maxHp'] > 0 &&
            prev['maxHp'] > curr['maxHp']
        );
        const hit = weapon === 'Emerald Plasma Scythe' ? max_hp_decreased : hp_decreased;

        if (
            (weapon === 'Very Cool Stick' || weapon === 'Even Cooler Stick' || weapon === 'Flowering Sakura Stick') &&
            !effects.banish &&
            enemy_was_banished()
        ) {
            if (banish_conversion_entire_queue(action.enemy)) {
                effects.banish = true;
                mark_enemy_removal_pending(true);
            }
        }

        if (died) {
            const stats = get_session_stats();
            stats.slain++;

            const options = CACHE.get("user_options");
            // check if next in line is a clone.
            if(options.soundalert && queue.length > 2 && queue[1].clone){
                new Audio("https://dogonline.net/audio/woof.mp3").play();
            }

            // update enemy loot stats
            const section_count = stats.loot.length;
            const enemy = get_enemy_loot(stats, prev);
            enemy.count++;
            if (stats.loot.length > section_count) enemy.time = Math.max(Date.now(), ...stats.loot.map(entry => entry.time + 1));
            stats.loot_enemy = {
                name: enemy.name, image: enemy.image, coordinates: { ...prev_state.coordinates }, received: false,
            };
            update_current_enemy_in_queue(prev['name'], prev['image'], 0, curr['maxHp'] ?? prev['maxHp']);
            mark_enemy_removal_pending();
        }

        // split on every scythe hit
        if (weapon === 'Emerald Plasma Scythe' && hit) {
            add_split_enemy_to_back_of_queue();
            if (!died) queue[0].clone = true;
            effects.split = true;
        }

        complete_pending_removal();
        if (CACHE.get('removal_pending') === null && curr['visible'] && curr['hp'] > 0) {
            const summoned_by_trickster_donut = weapon === 'Trickster Donut';
            let latest_enemy_is_decloned_by_trickster_donut = false;
            if (
                summoned_by_trickster_donut &&
                !effects.donut && (
                    finished ||
                    curr['name'] !== action.enemy?.name ||
                    curr['maxHp'] !== action.enemy?.maxHp
                )
            ) {
                remember_original_enemy_hp(curr, curr['maxHp'] / 2);
                effects.donut = true;
                latest_enemy_is_decloned_by_trickster_donut = true;
            }
            if (!summoned_by_trickster_donut || effects.donut) remember_original_enemy_hp(curr);
            const is_clone = latest_enemy_is_decloned_by_trickster_donut ? false : (queue?.[0]?.['clone'] ?? false);
            update_current_enemy_in_queue(curr['name'], curr['image'], curr['hp'], curr['maxHp'], is_clone);
            check_and_remove_enemy_death_animation_to_remove_grayscale_death_animation_if_no_longer_clone();
            CACHE.assign('tracking', { waiting_for_next_enemy: false });
        }

        if (hit) {
            const source = weapon === null ? '' : ` by '${weapon}'`;
            if (weapon === 'Emerald Plasma Scythe') {
                console.info(`Enemy '${curr['name']}' hit${source} and split!`);
            } else {
                const damage = curr['last_dealt'] > 0 ? curr['last_dealt'] : prev['hp'] - curr['hp'];
                console.info(`Enemy '${curr['name']}' ${died ? 'died after getting ' : ''}hit${source} for ${damage} HP!`);
            }
        }
    };

    // compare the latest two states
    const resolve_state_change = () => {
        const state = CACHE.get('state');
        if (state === null) return null;
        const prev = CACHE.get('prev') ?? state;

        // loot belongs to this state
        const loot = {
            prev: Array.isArray(prev['loot']) ? prev['loot'] : [],
            curr: Array.isArray(state['loot']) ? state['loot'] : [],
        };

        return structuredClone({
            active: {
                changed: prev['active'] !== state['active'],
                now: state['active'],
            },
            coordinates: {
                changed: prev['coordinates']?.['x'] !== state['coordinates']['x'] ||
                    prev['coordinates']?.['y'] !== state['coordinates']['y'],
                now: state['coordinates'],
            },
            mob: {
                visible: state['mob']['visible'],
                different: {
                    changed: prev['mob']?.['name'] !== state['mob']['name'],
                    now: state['mob']['name'],
                },
                hp: {
                    changed: prev['mob']?.['hp'] !== state['mob']['hp'],
                    now: state['mob']['hp'],
                },
            },
            loot: {
                changed: loot.prev.length !== loot.curr.length || loot.prev.some((item, index) =>
                    item?.['name'] !== loot.curr[index]?.['name'] || item?.['image'] !== loot.curr[index]?.['image']
                ),
                now: state['loot'],
            },
        });
    };

    // match weapons to response entries
    const process_deferred_request = async (resource, config, indices, request_id = 0, revision = tower_revision) => {
        if (!instance.is_current()) return [];
        const request = resource instanceof Request ? resource : null;
        const method = config?.['method'] ?? request?.method ?? 'GET';
        const turns = [];
        if (method.toUpperCase() !== 'POST') return turns;
        const combat_items = CACHE.get('tower_state_raw')?.['ui']?.['combatItems'] ?? null;

        let body = config?.['body'];
        if (body === undefined && request !== null) {
            body = await request.clone().text();
        }
        if (typeof body === 'string') {
            body = JSON.parse(body);
        }
        if (!instance.is_current() || revision !== tower_revision) return turns;

        for (const index of indices) {
            const entry = body?.[index] ?? (index === 0 ? body : null);
            const turn = entry?.['json']?.['turn'] ?? null;
            if (turn === null) continue;
            const selected = /^use-item-[1-4]$/.test(turn) ? CACHE.get('equip')?.(turn) ?? null : null;
            const on_cooldown = is_weapon_on_cooldown(Number(turn.slice(-1)));
            const action = (selected === null)
                ? null
                : use_combat_weapon(selected, request_id, on_cooldown, combat_items);
            const item = action?.item ?? null;
            turns.push({ index, item, action });
        }
        return turns;
    };

    // track the upcoming portrait slots
    const previous_upcoming_mobs = CACHE.get('upcoming_mobs');
    if (previous_upcoming_mobs?.timer != null) clearTimeout(previous_upcoming_mobs.timer);
    const upcoming_mobs = { parent: null, tilekey: null, revision: 0, slots: [], timer: null };
    CACHE.set('upcoming_mobs', upcoming_mobs);

    // stop an unfinished forward move if needed
    const clear_upcoming_mobs = () => {
        if (upcoming_mobs.timer !== null) clearTimeout(upcoming_mobs.timer);
        for (const slot of upcoming_mobs.slots) slot.remove();
        Object.assign(upcoming_mobs, {
            parent: null, tilekey: null, revision: upcoming_mob_revision, slots: [], timer: null,
        });
    };

    // show the next five enemies
    const update_upcoming_mobs = () => {
        if (CACHE.get('upcoming_mobs') !== upcoming_mobs) return;
        if (!CACHE.get('user_options')?.['congo']) {
            clear_upcoming_mobs();
            return;
        }
        const state = CACHE.get('state');
        const parent = document.querySelector('div[class^="tower_tuiMobPortrait__"], div[class*=" tower_tuiMobPortrait__"]');
        const tilekey = get_tile_key(state?.['coordinates']);
        if (!state?.['active'] || parent === null || tilekey === null) {
            clear_upcoming_mobs();
            return;
        }

        const changed = (
            upcoming_mobs.parent !== parent ||
            upcoming_mobs.tilekey !== tilekey ||
            upcoming_mobs.slots.length !== 5 ||
            upcoming_mobs.slots.some(slot => slot.parentElement !== parent || slot.firstElementChild === null)
        );
        if (changed) {
            clear_upcoming_mobs();
            const slots = [];
            for (let index = 5; index >= 1; index--) {
                const id = `tower-stats-upcoming-mob-${index}`;
                const slot = parent.querySelector(`#${id}`) ?? document.createElement('div');
                slot.id = id;
                slot.className = 'tower-stats-upcoming-mob';
                if (slot.firstElementChild === null) {
                    const image = document.createElement('div');
                    image.className = 'tower-stats-upcoming-mob-image-wrapper';
                    slot.appendChild(image);
                }
                slots.push(slot);
            }
            const fragment = document.createDocumentFragment();
            for (const slot of slots) fragment.appendChild(slot);
            parent.insertBefore(fragment, parent.firstChild);
            Object.assign(upcoming_mobs, { parent, tilekey, revision: upcoming_mob_revision, slots });
        }

        const advanced = upcoming_mobs.revision !== upcoming_mob_revision;
        upcoming_mobs.revision = upcoming_mob_revision;
        if (!state['mob']['visible'] && upcoming_mobs.timer !== null) {
            clearTimeout(upcoming_mobs.timer);
            upcoming_mobs.timer = null;
        }
        if (upcoming_mobs.timer !== null) return;
        if (!changed && advanced && state['mob']['visible']) {
            void parent.offsetWidth;
            for (const slot of upcoming_mobs.slots) slot.classList.add('moving-forward');
            // wait for every staggered move
            const time_to_ms = time => parseFloat(time) * (time.trim().endsWith('ms') ? 1 : 1000);
            const duration = Math.max(0, ...upcoming_mobs.slots.flatMap(slot => [slot, slot.firstElementChild]).map(element => {
                const style = getComputedStyle(element);
                const durations = style.transitionDuration.split(',').map(time_to_ms);
                const delays = style.transitionDelay.split(',').map(time_to_ms);
                return Math.max(
                    0,
                    ...style.transitionProperty
                        .split(',')
                        .map(
                            (property, index) => (property.trim() === 'none') ? 0 : durations[index % durations.length] + delays[index % delays.length]
                        )
                );
            }));
            const timer = setTimeout(() => {
                if (!instance.is_current() || upcoming_mobs.timer !== timer || CACHE.get('upcoming_mobs') !== upcoming_mobs) return;
                upcoming_mobs.timer = null;
                for (const slot of upcoming_mobs.slots) slot.classList.remove('moving-forward');
                update_upcoming_mobs();
            }, duration);
            upcoming_mobs.timer = timer;
            return;
        }

        const queue = get_queue();
        for (const slot of upcoming_mobs.slots) {
            if (slot.classList.contains('moving-forward')) slot.classList.remove('moving-forward');
            const index = Number(slot.id.slice(slot.id.lastIndexOf('-') + 1));
            const image = queue?.[index]?.['image'] ?? '';
            const wrapper = slot.firstElementChild;
            if (wrapper.dataset.image !== image || wrapper.classList.contains('clone') !== (queue?.[index]?.['clone'] ?? false)) {
                // add clone class if the respective enemy in the queue is marked as a clone
                if (queue?.[index]?.['clone'] ?? false) {
                    wrapper.classList.add('clone');
                } else if (wrapper.classList.contains('clone')) {
                    wrapper.classList.remove('clone');
                }
                wrapper.style.backgroundImage = image ? `url(${JSON.stringify(image)})` : '';
                wrapper.dataset.image = image;
            }
        }
    };

    // match the fade masks to current scrolling position
    const update_mob_queue_masks = () => {
        for (const queue of document.querySelectorAll('#tower-stats-queue, #tower-stats-loot-list')) {
            if (queue.clientHeight === 0) continue;
            const overflow = Math.max(0, queue.scrollHeight - queue.clientHeight);
            const progress = (overflow === 0 || queue.scrollTop <= 0)
                ? 0
                : queue.scrollTop >= overflow - 1
                    ? 1
                    : queue.scrollTop / overflow;
            queue.style.animationName = overflow > 0 ? 'adjust-masks' : 'none';
            queue.style.animationDelay = `${-progress}s`;
        }
    };

    const mob_queue_css_updates = { previous: null };

    // keep track of the display inputs
    const get_mob_queue_css_inputs = () => {
        const state = CACHE.get('state');
        const tilekey = get_tile_key(state?.['coordinates']);
        const main = document.querySelector('main[class^="Layout_main"], main[class*=" Layout_main"]');
        const portrait = document.querySelector('div[class*="tower_tuiMobPortrait"] div[class*="tower_portraitImageContainer"] img[class*="tower_portraitImage"]');
        const bounds = main?.getBoundingClientRect();
        return [
            document.querySelector('div[class^="tower_towerGameplay"], div[class*=" tower_towerGameplay"]'),
            document.querySelector('[class^="tower_towerOptions__"], [class*=" tower_towerOptions__"]'),
            document.getElementById('tower-otions-restyling-order'),
            document.getElementById('tower-stats'),
            document.getElementById('tower-options'),
            main, bounds?.top, bounds?.left, bounds?.width, bounds?.height,
            main?.clientLeft, main?.clientWidth, document.documentElement.clientWidth,
            state?.['active'], state?.['mob']?.['visible'], tilekey,
            CACHE.get('user_options')?.['congo'], upcoming_mob_revision,
            portrait, portrait?.classList.contains('tower-stats-enemy-image-clone'),
            CACHE.get('enemy_queue')?.[tilekey]?.[0]?.['clone'] === true, CACHE.get('clone_grayscale'),
            document.querySelector('div[class^="tower_tuiMobPortrait__"], div[class*=" tower_tuiMobPortrait__"]'),
            ...upcoming_mobs.slots.flatMap(slot => [slot, slot.parentElement, slot.firstElementChild]),
            ...['tower-stats-queue', 'tower-stats-loot-list'].flatMap(id => {
                const list = document.getElementById(id);
                return [list, list?.clientHeight, list?.scrollHeight, list?.scrollTop];
            }),
        ];
    };

    // hopefully this element-aware approach will reduce a lot of the re-processing of the CSS updates
    // that was causing a lot of lag. maybe or maybe not, we will see.
    const update_mob_queue_css_variables = (reason = 'manual', entries = []) => {
        if (!instance.is_current()) return;
        reason = typeof reason === 'string' ? reason : reason?.type;
        if (reason !== 'manual') {
            // ignore moving slot styles
            if (reason === 'mutation' && entries.length > 0 && entries.every(entry =>
                entry.type === 'attributes' && entry.target.closest('.tower-stats-upcoming-mob') !== null
            )) return;
            const inputs = get_mob_queue_css_inputs();
            const previous = mob_queue_css_updates.previous;
            if (previous !== null && inputs.length === previous.length && inputs.every((value, index) => value === previous[index])) return;
        }

        try {
            if (get_dogonline_style('tower_towerOptions__') !== null) {
                reorder_tower_options_start_to_top();
            }

            const tower = document.querySelector('div[class^="tower_towerGameplay"], div[class*=" tower_towerGameplay"]');
            if (tower === null) {
                mob_queue_info_hide();
                return;
            }
            const options = document.getElementById('tower-options');
            if (options !== null) options.style.display = 'flex';
            const stats = document.querySelector('#tower-stats');
            if (stats === null) return;
            const state = CACHE.get('state');
            stats.style.display = 'flex';
            if (state?.['active'] && state?.['mob']?.['visible']) mob_queue_info_show_queue_only();
            else mob_queue_info_hide_queue_only();

            update_current_mob_grayscale_animation();
            update_mob_queue_masks();
            update_upcoming_mobs();

            const main = document.querySelector('main[class^="Layout_main"], main[class*=" Layout_main"]');
            if (main === null) return;

            const { top, left, right, bottom } = main.getBoundingClientRect();
            stats.style.setProperty('--top', `${Math.floor(top)}px`);
            stats.style.setProperty('--left', `${Math.floor(left)}px`);

            if (options !== null) {
                const edge = Math.min(document.documentElement.clientWidth, left + main.clientLeft + main.clientWidth);
                options.style.setProperty('--top', `${Math.floor(top)}px`);
                options.style.setProperty('--right', `${Math.floor(document.documentElement.clientWidth - edge)}px`);
            }
        } finally {
            // lastly bundle in our own display changes
            mob_queue_css_updates.previous = get_mob_queue_css_inputs();
        }
    }

    const scroll_interceptor = function () {
        const enabled = CACHE.get('user_options')?.['scrolling'];
        if (!enabled) {
            return CACHE.get('native_scroll').apply(this, arguments);
        }
        const stack = (new Error()).stack ?? '';
        const tower_stack = stack
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.includes('_next') && line.includes('pages/tower'))
            .join('')
            .trim();
        if (tower_stack.length === 0) {
            // not a tower initated scroll
            return CACHE.get('native_scroll').apply(this, arguments);
        }
    }

    const TOWER_KEYBOARD_BINDINGS = {
        weapon_top_left: { label: 'Top-left', key: '1', group: 'Weapons' },
        weapon_top_right: { label: 'Top-right', key: '2', group: 'Weapons' },
        weapon_bottom_left: { label: 'Bottom-left', key: '3', group: 'Weapons' },
        weapon_bottom_right: { label: 'Bottom-right', key: '4', group: 'Weapons' },
        primary: { label: 'Primary', key: 'e', group: 'Interact' },
        secondary: { label: 'Secondary', key: 'r', group: 'Interact' },
        dropdown: { label: 'Dropdown select', key: 's', group: 'Interact' },
        leave: { label: 'Leave tower', key: 'l', group: 'Leave' },
    };

    const normalize_keyboard_key = value => typeof value === 'string' && value.length > 0 && value.length <= 32 ? value.toLowerCase() : null;
    const keyboard_key_allowed = (role, key) => {
        if (key === null || ['shift', 'control', 'alt', 'meta', 'altgraph', 'dead', 'unidentified'].includes(key)) return false;
        if (role === 'dropdown' && key === 's') return true;
        return !['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key);
    };
    const keyboard_key_label = key => key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);

    const setup_user_options = () => {
        let options = CACHE.get('user_options');
        if (options === null || typeof options !== 'object' || Array.isArray(options)) {
            options = {};
            CACHE.set('user_options', options);
        }
        const defaults = {
            scrolling: false,
            congo: true,
            foreverloot: false,
            keyboard: false,
            dogmaticseal: true,
            alwayshidequeuelist: false,
            hidewhenbig: true,
            disabledweaponsadvancestext: false
        };
        for (const [key, value] of Object.entries(defaults)) {
            if (typeof options[key] !== 'boolean') options[key] = value;
        }
        options.doggi_export_name = typeof options.doggi_export_name === 'string' ? options.doggi_export_name.trim() : '';
        if (!options.keyboard_bindings || typeof options.keyboard_bindings !== 'object' || Array.isArray(options.keyboard_bindings)) options.keyboard_bindings = {};
        const used = new Set();
        for (const [role, binding] of Object.entries(TOWER_KEYBOARD_BINDINGS)) {
            let key = normalize_keyboard_key(options.keyboard_bindings[role]);
            if (!keyboard_key_allowed(role, key) || used.has(key)) {
                key = [binding.key, '1', '2', '3', '4', 'e', 'r', 's', 'l', 'q', 'f', 'g', 'z', 'x', 'c', 'v']
                    .find(candidate => keyboard_key_allowed(role, candidate) && !used.has(candidate));
            }
            options.keyboard_bindings[role] = key;
            used.add(key);
        }

        if (CACHE.get('native_scroll') === null) {
            CACHE.set('native_scroll', window.scrollTo);
        }
        instance.scroll = scroll_interceptor;
        window.scrollTo = instance.scroll;
    }

    const TOWER_OPTION_TYPES = {
        CHECKBOX: 'checkbox',
        TEXT: 'text',
        SELECT: 'select',
        MULTISELECT: 'multiselect',
    };

    const export_loot_for_doggi = name => {
        // modified cyrb53 algorithm
        const hash_8_characters = str => {
            let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
            for (let i = 0, ch; i < str.length; i++) {
                ch = str.charCodeAt(i);
                h1 = Math.imul(h1 ^ ch, 2654435761);
                h2 = Math.imul(h2 ^ ch, 1597334677);
            }
            h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
            h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

            const hashInt = (h1 >>> 0) ^ (h2 >>> 0);
            return (hashInt >>> 0).toString(16).padStart(8, '0');
        };

        const sanitized = filename => filename
            .replace(/[^a-zA-Z0-9\-]/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_+|_+$/g, '');

        const loot = get_session_stats()?.['loot'] ?? null;
        if (loot === null) {
            console.warn('No loot to export!');
            return;
        }
        console.info('Exporting loot for DOGGI!', loot);
        const exported = {
            sources: {},
            recordedAt: (new Date().toISOString()),
            name,
            doggiExportVersion: 1,
        };
        for (const item of loot) {
            exported.sources[item.name] = {
                count: item.count,
                items: item.loot.map(which => ({ name: which.name, quantity: which.count }))
            };
        }

        const hash = hash_8_characters(JSON.stringify(exported.sources));
        exported['sourcesHash'] = hash;

        const finalized = JSON.stringify(exported, undefined, 2);
        const blob = new Blob([finalized], { type: 'text/plain;charset=utf-8' });
        const objurl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.style.display = 'none';
        anchor.href = objurl;
        anchor.download = sanitized(`DOGGI-${name}-${Date.now()}`) + '.json';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(objurl);
    }

    const doggi_button_clicked = (doggi, get_value) => {
        if (!instance.is_current()) return;
        const bounds = doggi.getBoundingClientRect();
        const input = document.createElement('input');
        input.id = doggi.id;
        input.className = doggi.className;
        input.type = 'text';
        input.placeholder = 'Name?';
        input.value = get_value('doggi_export_name');
        input.autocomplete = 'off';
        input.setAttribute('aria-label', 'DOGGI export name');
        input.style.width = `${bounds.width}px`;
        input.style.height = `${bounds.height}px`;
        const restore = () => {
            if (!instance.is_current() || !input.isConnected) return;
            input.onblur = null;
            input.replaceWith(doggi);
        };
        input.onblur = restore;
        input.onkeydown = event => {
            if (!instance.is_current() || !input.isConnected || event.isComposing) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                restore();
                return;
            }
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            const name = input.value.trim();
            if (name === '') return;
            CACHE.get('user_options')['doggi_export_name'] = name;
            localstorage_save();
            restore();
            export_loot_for_doggi(name);
        };
        doggi.replaceWith(input);
        input.focus();
    }

    const create_tower_options = () => {
        const option = (label, key, type, callback) => ({ enabled: false, label, key, type, callback });
        const set_value = (key, value) => {
            if (!instance.is_current()) return;
            CACHE.get('user_options')[key] = value;
            update_keyboard_options();
            update_hide_queue_when_big_option();
            localstorage_save();
            update_mob_queue_css_variables();
            window.dispatchEvent(new Event('tower-tracker-options-changed'));
        };
        const get_value = key => CACHE.get('user_options')[key];
        const update_keyboard_options = () => {
            const disabled = get_value('keyboard') !== true;
            const bindings = options.querySelector('#tower-keyboard-bindings');
            if (bindings) bindings.disabled = disabled;
            const input = options.querySelector('input[name="disabledweaponsadvancestext"]');
            if (input) {
                input.disabled = disabled;
                input.closest('.tower-option-list-item').classList.toggle('disabled', disabled);
            }
        };
        const update_hide_queue_when_big_option = () => {
            const disabled = get_value('alwayshidequeuelist') === true;
            const input = options.querySelector('input[name="hidewhenbig"]');
            if (input) {
                input.disabled = disabled;
                input.closest('.tower-option-list-item').classList.toggle('disabled', disabled);
            }
        };

        let currently_expanded = false;

        const available = [
            option('Disable automatic scrolling', 'scrolling', TOWER_OPTION_TYPES.CHECKBOX, set_value),
            option('Queue of enemies behind door', 'congo', TOWER_OPTION_TYPES.CHECKBOX, set_value),
            option('Persist loot between sessions', 'foreverloot', TOWER_OPTION_TYPES.CHECKBOX, set_value),
            option('Using Dogmatic Seal', 'dogmaticseal', TOWER_OPTION_TYPES.CHECKBOX, set_value),
            option('Always hide queue list', 'alwayshidequeuelist', TOWER_OPTION_TYPES.CHECKBOX, (key, value) => {
                set_value(key, value);
                mob_queue_info_update();
            }),
            option('Hide queue when >= 100 enemies', 'hidewhenbig', TOWER_OPTION_TYPES.CHECKBOX, (key, value) => {
                set_value(key, value);
                mob_queue_info_update();
            }),
            option('Disabled weapons advances text', 'disabledweaponsadvancestext', TOWER_OPTION_TYPES.CHECKBOX, set_value),
            option('Alert when queue is only clones', 'soundalert', TOWER_OPTION_TYPES.CHECKBOX, set_value),
            option('Keyboard controls', 'keyboard', TOWER_OPTION_TYPES.CHECKBOX, set_value),
        ];

        const options = document.createElement('div');
        options.id = 'tower-options';

        const expand = document.createElement('div');
        expand.id = 'tower-options-expand';
        expand.innerHTML = 'Options <span>[+]</span>';

        expand.onclick = () => {
            if (!instance.is_current()) return;
            currently_expanded = !currently_expanded;
            expand.querySelector('span').textContent = currently_expanded ? '[-]' : '[+]';
            wrapper.classList.toggle('expanded', currently_expanded);
            update_mob_queue_css_variables();
        }

        const wrapper = document.createElement('div');
        wrapper.id = 'tower-option-list-wrapper';

        const list = document.createElement('div');
        list.id = 'tower-option-list';

        for (const index in available) {
            const selection = available[index];
            const item = document.createElement('div');
            item.id = `tower-option-list-item-${index}`;
            item.classList.add('tower-option-list-item');

            const input = document.createElement('input');
            input.classList.add('tower-option-list-item-input');
            switch (selection.type) {
                case TOWER_OPTION_TYPES.CHECKBOX:
                    input.type = 'checkbox';
                    input.id = `tower-option-list-item-${index}-input-checkbox`;
                    input.classList.add('tower-option-list-item-input-checkbox');
                    input.name = selection.key;
                    input.checked = get_value(selection.key);
                    input.onchange = evt => {
                        if (!evt.target.disabled) selection.callback(selection.key, evt.target.checked);
                    };
                    break;
                case TOWER_OPTION_TYPES.MULTISELECT:
                    // eventually
                    break;
                case TOWER_OPTION_TYPES.SELECT:
                    // eventually
                    break;
                case TOWER_OPTION_TYPES.TEXT:
                    // eventually
                    break;
                default:
                    // unknown option
                    break;
            }
            item.appendChild(input);

            const label = document.createElement('label');
            label.id = `tower-option-list-item-${index}-label`;
            label.classList.add('tower-option-list-item-label');
            label.textContent = selection.label;
            label.htmlFor = input.id;
            item.appendChild(label);

            list.appendChild(item);
        }

        const bindings = document.createElement('fieldset');
        bindings.id = 'tower-keyboard-bindings';
        bindings.disabled = get_value('keyboard') !== true;
        const content = document.createElement('div');
        bindings.appendChild(content);
        const hint = document.createElement('div');
        hint.className = 'tower-keyboard-hint';
        hint.textContent = 'Press a key-bind button, followed by the key you wish to set it to.';
        content.appendChild(hint);
        const status = document.createElement('div');
        status.id = 'tower-keyboard-binding-status';
        status.innerHTML = '<span>Status:&nbsp;</span>';
        status.setAttribute('role', 'status');
        let group = null;
        for (const [role, binding] of Object.entries(TOWER_KEYBOARD_BINDINGS)) {
            if (group !== binding.group) {
                const title = document.createElement('div');
                title.className = 'tower-keyboard-group-title';
                title.textContent = binding.group;
                content.appendChild(title);
                group = binding.group;
            }
            const row = document.createElement('label');
            row.className = 'tower-keyboard-binding';
            const label = document.createElement('span');
            label.textContent = binding.label;
            const input = document.createElement('input');
            input.id = `tower-keyboard-binding-${role}`;
            input.name = `keyboard_bindings.${role}`;
            input.type = 'text';
            input.readOnly = true;
            input.autocomplete = 'off';
            input.spellcheck = false;
            input.value = keyboard_key_label(get_value('keyboard_bindings')[role]);
            input.title = 'Click, then press a key';
            input.setAttribute('aria-label', `${binding.group}: ${binding.label} key`);
            input.onkeydown = event => {
                if (!instance.is_current()) return;
                if (event.repeat || event.isComposing) return;
                event.preventDefault();
                event.stopPropagation();
                const key = normalize_keyboard_key(event.key);
                if (event.ctrlKey || event.altKey || event.metaKey || !keyboard_key_allowed(role, key)) {
                    status.innerHTML = '<span>Status:&nbsp;</span>WASD and Arrows are not allowed.';
                    return;
                }
                const current = get_value('keyboard_bindings');
                const duplicate = Object.keys(TOWER_KEYBOARD_BINDINGS).find(other => other !== role && current[other] === key);
                if (duplicate) {
                    status.innerHTML = `<span>Status:&nbsp;</span>${keyboard_key_label(key)} is already assigned to ${TOWER_KEYBOARD_BINDINGS[duplicate].label.toLowerCase()}.`;
                    return;
                }
                current[role] = key;
                input.value = keyboard_key_label(key);
                status.innerHTML = `<span>Status:&nbsp;</span>[${binding.label}] -> ${keyboard_key_label(key)}`;
                localstorage_save();
                window.dispatchEvent(new Event('tower-tracker-options-changed'));
                input.blur();
            };
            row.append(label, input);
            content.appendChild(row);
        }
        content.appendChild(status);
        list.appendChild(bindings);

        const doggi = document.createElement('div');
        doggi.id = 'tower-option-doggi-export';
        doggi.classList.add('tower-option-button');
        doggi.textContent = "Export loot for DOGGI";
        doggi.onclick = () => doggi_button_clicked(doggi, get_value);
        list.appendChild(doggi);

        const restart = document.createElement('button');
        restart.id = 'tower-options-restart';
        restart.type = 'button';
        restart.textContent = 'Clear localStorage and Reinit';
        restart.disabled = restarting;
        restart.onclick = () => {
            void restart_tracker().catch(err => console.error('Could not restart tower tracking???', err));
        };
        list.appendChild(restart);

        options.appendChild(expand);
        wrapper.appendChild(list);
        options.appendChild(wrapper);
        document.body.appendChild(options);
        update_keyboard_options();
    };

    const create_tower_stats = () => {
        const stats = document.createElement('div');
        stats.id = 'tower-stats';

        const title = document.createElement('div');
        title.id = 'tower-stats-title';
        title.textContent = 'Loading...';

        const subtitle = document.createElement('div');
        subtitle.id = 'tower-stats-subtitle';
        subtitle.textContent = 'Loading...';

        const queue = document.createElement('div');
        queue.id = 'tower-stats-queue';

        const too_big_indicator = document.createElement('div');
        too_big_indicator.id = 'tower-stats-queue-too-big';
        too_big_indicator.textContent = 'Loading...';

        const lower = document.createElement('div');
        lower.id = 'tower-stats-title-lower';
        lower.textContent = 'Loading...';

        const slain = document.createElement('div');
        slain.id = 'tower-stats-slain';
        slain.textContent = 'Loading...';

        const loot = document.createElement('div');
        loot.id = 'tower-stats-loot';
        loot.textContent = 'Loading...';

        const looted = document.createElement('div');
        looted.id = 'tower-stats-loot-list';

        stats.appendChild(title);
        stats.appendChild(subtitle);
        stats.appendChild(queue);
        stats.appendChild(too_big_indicator);
        stats.appendChild(lower);
        stats.appendChild(slain);
        stats.appendChild(loot);
        stats.appendChild(looted);

        document.body.appendChild(stats);
    };

    let mob_queue_style_ready = false;

    const mob_queue_info_update = () => {
        if (!mob_queue_style_ready) {
            const style = document.getElementById('tower-stats-style') ?? document.createElement('style');
            style.id = 'tower-stats-style';
            style.textContent = TOWER_STYLE;
            document.head.appendChild(style);
            mob_queue_style_ready = true;
        }

        if (document.body.querySelector('#tower-stats') === null) {
            create_tower_stats();
        }

        if (document.body.querySelector('#tower-options') === null) {
            create_tower_options();
        }

        const queue = document.getElementById('tower-stats-queue');
        queue.onscroll = update_mob_queue_masks;

        queue.replaceChildren(); // empty children
        const enemies = get_queue() ?? [];

        const too_big_indicator = document.getElementById('tower-stats-queue-too-big');
        if (too_big_indicator !== null) {
            if (CACHE.get('user_options')?.['alwayshidequeuelist'] ?? false) {
                too_big_indicator.innerHTML = 'You are currently hiding your queue.<br />(disable this in Options)';
            } else {
                too_big_indicator.innerHTML = 'Your queue size is &gt;&equals; 100!<br />Hiding the queue to save on resources...';
            }
        }

        const too_big = (
            (enemies.length >= 100 && (CACHE.get('user_options')?.['hidewhenbig'] ?? true)) ||
            (CACHE.get('user_options')?.['alwayshidequeuelist'] ?? false)
        );
        if (too_big) {
            if (!queue.classList.contains('too-big')) {
                queue.classList.add('too-big');
            }
            if (!too_big_indicator.classList.contains('too-big')) {
                too_big_indicator.classList.add('too-big');
            }
        } else {
            if (queue.classList.contains('too-big')) {
                queue.classList.remove('too-big');
            }
            if (too_big_indicator.classList.contains('too-big')) {
                too_big_indicator.classList.remove('too-big');
            }
        }

        if (!too_big) {
            for (const enemy in enemies) {
                // const { name, image, hp, maxHp } = enemy;
                const item = document.createElement('div');
                item.classList.add('tower-stats-enemy');

                const index = document.createElement('div');
                const image = document.createElement('div');
                const stacked = document.createElement('div');
                const wrapper_name = document.createElement('div');
                const wrapper_hp = document.createElement('div');
                const name = document.createElement('div');
                const hp = document.createElement('div');
                index.classList.add('tower-stats-enemy-index')
                image.classList.add('tower-stats-enemy-image');
                stacked.classList.add('tower-stats-enemy-stacked-info');
                wrapper_name.classList.add('tower-stats-enemy-name-wrapper');
                wrapper_hp.classList.add('tower-stats-enemy-hp-wrapper');
                name.classList.add('tower-stats-enemy-name');
                hp.classList.add('tower-stats-enemy-hp');

                index.textContent = `${enemy}`;
                image.style.backgroundImage = `url('${enemies[enemy]['image']}')`;
                if (enemies[enemy]['clone']) {
                    image.classList.add('tower-stats-enemy-image-clone');
                    image.style.backgroundSize = '0 0';
                }
                name.textContent = `${enemies[enemy]['name']}`;
                hp.textContent = `${enemies[enemy]['hp']}/${enemies[enemy]['maxHp']}`;

                const percentage = enemies[enemy]['hp'] / enemies[enemy]['maxHp'];
                wrapper_hp.style.setProperty('--current-percentage', `${percentage * 100}%`);

                wrapper_name.appendChild(name);
                wrapper_hp.appendChild(hp);

                stacked.appendChild(wrapper_name);
                stacked.appendChild(wrapper_hp);

                item.appendChild(index);
                item.appendChild(image);
                item.appendChild(stacked);

                queue.appendChild(item);
            }
        }

        const title = document.getElementById('tower-stats-title');
        if (title !== null) {
            title.textContent = `Enemy Queue: x${(get_queue() ?? []).length}`;
        }

        const subtitle = document.getElementById('tower-stats-subtitle');
        if (subtitle !== null) {
            const coordinates = CACHE.get('state')?.['coordinates'] ?? { x: null, y: null };
            subtitle.textContent = `Queue at tile {x: ${coordinates.x}, y: ${coordinates.y}}`;
        }

        const lower = document.getElementById('tower-stats-title-lower');
        if (lower !== null) {
            lower.textContent = `Session Stats`;
        }

        const session = get_session_stats();
        const slain = document.getElementById('tower-stats-slain');
        if (slain !== null) {
            slain.textContent = `Enemies killed: ${session.slain}`;
        }

        const loot = document.getElementById('tower-stats-loot');
        if (loot !== null) {
            loot.textContent = `Dropped Loot:`;
        }

        const looted = document.getElementById('tower-stats-loot-list');
        if (looted !== null) {
            looted.onscroll = update_mob_queue_masks;
            const list = document.createDocumentFragment();
            for (const enemy of session.loot) {
                const header = document.createElement('div');
                const image = document.createElement('div');
                const name = document.createElement('div');
                header.className = 'tower-stats-loot-list-item-header';
                image.className = 'tower-stats-loot-list-enemy-image';
                image.style.backgroundImage = `url(${JSON.stringify(enemy.image)})`;
                name.append(document.createElement('span'), document.createTextNode(` ${enemy.name}`));
                header.append(image, name);
                header.querySelector('span').textContent = `${enemy.count}x`;
                list.appendChild(header);
                for (const entry of enemy.loot) {
                    const item = document.createElement('div');
                    const image = document.createElement('div');
                    const name = document.createElement('div');
                    item.classList.add('tower-stats-loot-list-item');
                    image.classList.add('tower-stats-loot-list-item-image');
                    name.classList.add('tower-stats-loot-list-item-name');
                    image.style.backgroundImage = `url(${JSON.stringify(entry.image)})`;
                    name.textContent = `${entry.count}x ${entry.name}`;
                    item.appendChild(image);
                    item.appendChild(name);
                    list.appendChild(item);
                }
            }
            looted.replaceChildren(list);
        }
        update_mob_queue_css_variables();
    }

    const get_caller = () => {
        // debugging ...
        return (new Error().stack).split('\n')[2].split('@')[0].trim();
    }

    const mob_queue_info_show = () => {
        const stats = document.body.querySelector('#tower-stats');
        if (stats === null) return;
        stats.style.display = 'flex';
        update_mob_queue_css_variables();
    }

    const mob_queue_info_hide = () => {
        for (const id of ['tower-stats', 'tower-options']) {
            const element = document.getElementById(id);
            if (element !== null) element.style.display = 'none';
        }
    }

    const mob_queue_info_hide_queue_only = () => {
        for (const id of ['tower-stats-title', 'tower-stats-subtitle', 'tower-stats-queue', 'tower-stats-queue-too-big']) {
            const element = document.getElementById(id);
            if (element !== null) element.style.display = 'none';
        }
    }

    const mob_queue_info_show_queue_only = () => {
        for (const id of ['tower-stats-title', 'tower-stats-subtitle', 'tower-stats-queue', 'tower-stats-queue-too-big']) {
            const element = document.getElementById(id);
            if (element !== null) element.style.display = '';
        }
    }

    // handle all state changes in response
    const process_deferred_response = (body, indices, turns = null, request_id = 0, revision = tower_revision) => {
        if (!instance.is_current() || revision !== tower_revision) return;
        let updated = false;
        for (const index of indices) {
            const action = get_weapon_use(turns, index, request_id);
            if (!update_raw_tower_state_from_response(body, true, index)) continue;
            updated = true;
            const state = CACHE.get('state');
            if (state === null) continue;
            const item = action?.item ?? null;
            if (action !== null) {
                action.resolving = state['resolving_weapon_use'];
                if (pending_weapon_use === null) {
                    pending_weapon_use = action;
                    CACHE.assign('tracking', { pending: item });
                }
            }
            try {
                const status = resolve_state_change();
                process_enemy_change(item, action);
                if (status.loot.changed) process_loot_drop(status.loot.now);

                for (const [label, change] of [
                    ['Active', status.active],
                    ['Coordinates', status.coordinates],
                    ['Mob', status.mob.different],
                    ['Mob HP', status.mob.hp],
                    ['Loot', status.loot],
                ]) {
                    if (change.changed) console.notice(`${label} changed! It is now:`, change.now);
                }

                mob_queue_info_update();
            } finally {
                // finish only the matching action
                const banish_resolved = (item?.['name'] === 'Very Cool Stick' || item?.['name'] === 'Even Cooler Stick' || item?.['name'] === 'Flowering Sakura Stick') && action?.effects.banish;
                if (action !== null && pending_weapon_use === action && (!state['resolving_weapon_use'] || banish_resolved)) {
                    CACHE.assign('tracking', { pending: null });
                    pending_weapon_use = null;
                }
            }
        }
        if (updated && CACHE.get('state') !== null) localstorage_save();
    };

    // intercept requests without modifying them
    const patch_fetch = () => {
        if (CACHE.get('original_fetch') === null) {
            CACHE.set('original_fetch', window.fetch);
        }

        instance.fetch = async (...args) => {
            if (!instance.is_current()) return CACHE.get('original_fetch').apply(window, args);
            const [resource, config] = args;
            let indices = [];
            let turns = [];
            const revision = tower_revision;
            const request_id = ++next_request_id;

            // only intercept tower requests
            try {
                const url = new URL(resource instanceof Request ? resource.url : resource, window.location.href);
                if (url.origin === window.location.origin && url.pathname.startsWith('/api/trpc/')) {
                    indices = url.pathname.slice('/api/trpc/'.length).split(',')
                        .map((procedure, index) => procedure.startsWith('tower.') ? index : -1)
                        .filter(index => index !== -1);
                }
                if (indices.length > 0) {
                    turns = process_deferred_request(resource, config, indices, request_id, revision).catch(err => {
                        console.warn('Could not read tower request:', err);
                        return [];
                    });
                }
            } catch (err) {
                console.warn('Could not read request address:', err);
            }

            const response = await CACHE.get('original_fetch').apply(window, args);
            if (instance.is_current() && indices.length > 0) {
                // keep the response readable
                try {
                    void response.clone().json()
                        .then(async body => process_deferred_response(body, indices, await turns, request_id, revision))
                        .catch(err => console.warn('Could not read tower response:', err));
                } catch (err) {
                    console.warn('Could not copy tower response:', err);
                }
            }

            return response;
        };
        window.fetch = instance.fetch;

        console.info('window.fetch has been successfully patched!');
        console.info('Watching for tower events...');
    };

    // start with no pending weapon
    const setup_action_tracking = () => {
        pending_weapon_use = null;
        CACHE.set('tracking', {
            pending: null,
            waiting_for_next_enemy: true,
        });
    };

    let previous_enemy_queue_setup = null;

    const setup_enemy_queue = () => {
        const queue = CACHE.get('enemy_queue');
        if (queue === null || typeof queue !== 'object' || Array.isArray(queue)) {
            CACHE.set('enemy_queue', {});
        }
        const hps = CACHE.get('original_enemy_hp');
        if (hps === null || typeof hps !== 'object' || Array.isArray(hps)) {
            CACHE.set('original_enemy_hp', {});
        }
        const pending = CACHE.get('removal_pending');
        if (pending === null || typeof pending !== 'object' || typeof pending.banished !== 'boolean') {
            CACHE.set('removal_pending', null);
        }
        if (JSON.stringify(previous_enemy_queue_setup) !== JSON.stringify({ queue, hps, pending })) {
            console.notice('Enemy queue set up:', queue, hps, pending);
            previous_enemy_queue_setup = { queue, hps, pending };
        }
    };

    // clear the finished tower run
    const clear_tower_tracking = () => {
        if (!instance.is_current()) return;
        tower_revision++;
        clear_upcoming_mobs();
        setup_action_tracking();
        for (const key of ['state', 'prev', 'tower_state_raw', 'removal_pending']) CACHE.set(key, null);
        setup_enemy_queue();
        const queues = CACHE.get('enemy_queue');
        for (const queue of Object.values(queues)) {
            if (Array.isArray(queue)) queue.length = 0;
        }
        for (const key of ['enemy_queue', 'original_enemy_hp']) {
            const data = CACHE.get(key);
            for (const name of Object.keys(data)) delete data[name];
        }
        const session = get_session_stats();
        session.slain = 0;
        session.loot_enemy = null;
        if (!CACHE.get('user_options')?.['foreverloot']) session.loot.length = 0;
        localstorage_save();
        console.info('Tower tracking cleared.');
    };

    const setup_display_callbacks = () => {
        const element = document.getElementById('__next');

        // give reason to update to reduce unnecessary css updates
        const mutation = new MutationObserver(entries => update_mob_queue_css_variables('mutation', entries));
        mutation.observe(element, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
        });

        // give reason to update to reduce unnecessary css updates
        const resize = new ResizeObserver(() => update_mob_queue_css_variables('resize'));
        resize.observe(element);
        const queue = document.getElementById('tower-stats-queue');
        if (queue !== null) resize.observe(queue);
        const looted = document.getElementById('tower-stats-loot-list');
        if (looted !== null) resize.observe(looted);

        // give reason to update to reduce unnecessary css updates
        const intersection = new IntersectionObserver(() => update_mob_queue_css_variables('intersection'));
        intersection.observe(element);

        window.addEventListener('resize', update_mob_queue_css_variables, { passive: true });
        window.addEventListener('scroll', update_mob_queue_css_variables, { passive: true });

        // returns cleanup function to disconnect all observers/listeners
        // maybe will be used with a future "remove tracker" button, but
        // tbh just refresh the page or clear your localStorage.
        return () => {
            mutation.disconnect();
            resize.disconnect();
            intersection.disconnect();
            window.removeEventListener('resize', update_mob_queue_css_variables);
            window.removeEventListener('scroll', update_mob_queue_css_variables);
        };
    }


    // moving this to its own function with the new version guarding in place
    const initialize_tracker = async () => {
        if (!instance.is_current()) return;
        mob_queue_css_updates.previous = null;
        CACHE.get('display_cleanup')?.();
        instance.display_cleanup = null;
        document.getElementById('tower-options')?.remove(); // if loading script again

        CACHE.set('initalized', false);
        patch_console_logging();

        console.override('Initializing TOWER-TRACKER.js...');

        setup_action_tracking();
        localstorage_restore();
        setup_user_options();
        setup_enemy_queue();
        get_session_stats();

        // discard saved inactive runs
        const restored_state = CACHE.get('state');
        const restored_raw = CACHE.get('tower_state_raw');
        const restored_active = restored_state?.['active'] ?? restored_raw?.['active'] ?? (
            typeof restored_raw?.['state'] === 'string' ? restored_raw['state'] === 'active' : null
        );

        if (restored_active === false) clear_tower_tracking();

        patch_fetch();

        await get_user_items_and_store_in_window();
        if (!instance.is_current()) return;
        await get_tower_state_when_running_script_for_first_time();
        if (!instance.is_current()) return;

        mob_queue_info_update();
        instance.display_cleanup = setup_display_callbacks();
        CACHE.set('display_cleanup', instance.display_cleanup);

        CACHE.set('initalized', true);

        // so the user knows we've successfully installed the tracker for this session
        console.override('TOWER-TRACKER.js has initialized!');
    };

    const restart_tracker = async () => {
        if (!instance.is_current() || restarting) return;
        restarting = true;
        const restart = document.getElementById('tower-options-restart');
        if (restart !== null) restart.disabled = true;
        try {
            localStorage.removeItem(LOCALSTORAGE_KEY);
            tower_revision++;
            CACHE.set('initalized', false);
            clear_upcoming_mobs();
            CACHE.get('clone_grayscale')?.cancel();
            CACHE.set('clone_grayscale', null);
            for (const key of SAVED_LOCALSTORAGE_OBJECTS) CACHE.set(key, null);
            window.dispatchEvent(new Event('tower-tracker-options-changed'));
            mob_queue_info_hide();
            await initialize_tracker();
        } finally {
            restarting = false;
            const restart = document.getElementById('tower-options-restart');
            if (instance.is_current() && restart !== null) restart.disabled = false;
        }
    };

    try {
        await initialize_tracker();
    } catch (err) {
        instance.destroy();
        console.error('Tower tracker init aborted:', err);
        return null;
    }
    if (!instance.is_current()) {
        console.error(`Tower tracker version ${TRACKER_VERSION} init aborted: its instance was superseded.`);
        return null;
    }
    if (previous_version > 0 && previous_version < TRACKER_VERSION) {
        console.log(`Tower tracker upgraded from version ${previous_version} to version ${TRACKER_VERSION}.`);
    }
    return instance;

    // attach keyboard instead of running it individually since we are
    // tracking instance lifecycles now...
})())?.attach_keyboard(instance => {

    // keyboard controls now integrated into here!
    const INTEGRATION_KEY = "__DOGONLINE_TOWER_KEYBOARD_INTEGRATION__";
    const CACHE_KEY = "__DOG_DATA_TOWER_QUEUE_WINDOW_KEY__";
    const KEYBOARD_LISTENER = "__DOGONLINE_KEYBOARD_LISTENER__";
    const OPTIONS_EVENT = "tower-tracker-options-changed";
    const DEFAULT_BINDINGS = Object.freeze({
        weapon_top_left: "1",
        weapon_top_right: "2",
        weapon_bottom_left: "3",
        weapon_bottom_right: "4",
        primary: "e",
        secondary: "r",
        dropdown: "s",
        leave: "l",
    });
    window[INTEGRATION_KEY]?.destroy();
    let installed = null;
    let signature = null;

    function install_controls(mapping) {
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
            OPTION: [mapping.primary, mapping.secondary],
            WEAPONS: [mapping.weapon_top_left, mapping.weapon_top_right, mapping.weapon_bottom_left, mapping.weapon_bottom_right],
            DROPDOWN: mapping.dropdown,
            LEAVE: mapping.leave,
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
            KEYS.LEAVE,
            KEYS.DROPDOWN,
            ...KEYS.WEAPONS,
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
                            color: #eee;
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
                text.textContent = `\u00a0[${key}]\u00a0`;
                indicator.appendChild(text);
                anchor.append(indicator);
                const host = indicator_host(element);
                host.append(anchor);
                entry = { anchor, indicator, host, automatic: false };
                indicators.set(element, entry);
                indicator.resize?.observe(element);
            }
            entry.indicator.querySelector("span").textContent = `\u00a0[${key}]\u00a0`;
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
            for (const [element, assigned] of assignments) {
                const key = [...assigned.keys].filter(key => !key.toLowerCase().startsWith('arrow'))[0].toUpperCase();
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
            if (indicator.destroyed || !instance.is_current()) return;
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
                    KEYS.OPTION[0],
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
                if (visible(select)) assign(KEYS.DROPDOWN, select, "select");
            }

            const bottom = query(scope, "tower_tuiButtonsSection2");
            if (visible(bottom)) {
                for (const key of [KEYS.LEAVE, KEYS.OPTION[1]]) {
                    const label =
                        key === KEYS.LEAVE
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
                        KEYS.WEAPONS[index],
                        slot && !has_class(slot, "tower_empty") ? slot : null,
                        "click",
                        weapons,
                    );
                }
            }

            const textbox = query(scope, "tower_tuiTextbox");
            if (visible(textbox)) {
                if (available(textbox)) assign(KEYS.OPTION[0], textbox);
                else if (textbox.querySelector(selector("tower_textboxSpinner")))
                    assign(KEYS.OPTION[0], null);
            }
            return result;
        }

        function keypress(event) {
            const user_options = window[CACHE_KEY]?.user_options;
            if (!instance.is_current() || user_options?.keyboard !== true) return;
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
                event.target.closest("#tower-controls, #tower-options")
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
            else if (
                user_options.disabledweaponsadvancestext === true &&
                KEYS.WEAPONS.includes(key) && binding.element && binding.guard &&
                has_class(binding.guard, "tower_tuiCombatItems") &&
                has_class(binding.guard, "tower_disabled") && visible(binding.guard)
            ) {
                process(event);
                binding.guard.click();
            } else if (binding.guard && !available(binding.guard)) process(event);
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
        start_indicators();
        console.info("Tower Keyboard Controls Enabled!");
        return controller;
    }

    function remove_controls() {
        const existing = window[KEYBOARD_LISTENER];
        if (typeof existing?.destroy === "function") existing.destroy();
        else if (existing) {
            const listeners = existing.state?.listeners;
            for (const listener of listeners?.active ?? []) {
                listener.element?.removeEventListener(listener.event, listener.handler);
            }
            if (listeners?.main != null) clearInterval(listeners.main);
            document.getElementById("tower-controls")?.remove();
            document.getElementById("tower-keyboard-styles")?.remove();
            delete window[KEYBOARD_LISTENER];
        }
        installed = null;
        signature = null;
    }

    function sync() {
        if (!instance.is_current()) return;
        const options = window[CACHE_KEY]?.user_options;
        if (options?.keyboard !== true) {
            remove_controls();
            return;
        }
        const mapping = Object.fromEntries(Object.entries(DEFAULT_BINDINGS).map(([key, fallback]) => {
            const value = options.keyboard_bindings?.[key];
            return [key, typeof value === "string" && value.length ? value.toLowerCase() : fallback];
        }));
        const next = JSON.stringify(mapping);
        if (installed === window[KEYBOARD_LISTENER] && signature === next) return;
        installed = install_controls(mapping);
        signature = next;
    }

    const integration = {
        sync,
        destroy() {
            window.removeEventListener(OPTIONS_EVENT, sync);
            if (window[INTEGRATION_KEY] !== integration) return;
            remove_controls();
            if (window[INTEGRATION_KEY] === integration) delete window[INTEGRATION_KEY];
        },
    };
    window[INTEGRATION_KEY] = integration;
    window.addEventListener(OPTIONS_EVENT, sync);
    sync();
    return integration;
});

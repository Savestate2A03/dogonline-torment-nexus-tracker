(await(async () => {
    // store data on window
    const CACHE_KEY = '__DOG_DATA_TOWER_QUEUE_WINDOW_KEY__';

    // choose a logging level
    //  - everything
    //  - notice
    //  - info
    //  - log (original site logs + warn/error)
    //  - warn
    //  - error
    const LOGGING_LEVEL = 'log';

    const SAVED_LOCALSTORAGE_OBJECTS = ['state', 'prev', 'user_combat_items', 'tower_state_raw', 'enemy_queue', 'original_enemy_hp', 'removal_pending', 'session_stats'];
    const LOCALSTORAGE_KEY = 'SAVED_TOWER_TRACKER_DATA';
    let pending_weapon_use = null;
    let tower_revision = 0;
    let next_request_id = 0;
    let upcoming_mob_revision = 0;

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

    // save current state to localstorage
    const localstorage_save = () => {
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

    const initalized = () => CACHE.get('initalized') === true;

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
        return stats;
    };

    // add each new loot drop to saved loot data
    const process_loot_drop = loot => {
        const stats = get_session_stats();
        for (const item of Array.isArray(loot) ? loot : []) {
            if (typeof item?.['name'] !== 'string' || typeof item?.['image'] !== 'string') continue;
            const existing = stats.loot.find(entry => entry.name === item.name && entry.image === item.image);
            if (existing) existing.count++;
            else stats.loot.push({ image: item.image, name: item.name, count: 1 });
        }
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
            mob_queue_info_hide();
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
        const json = await response.json();
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

    const get_user_items_and_store_in_window = async () => {
        const cached = CACHE.get('user_combat_items');
        if (Array.isArray(cached?.['items'])) {
            if (typeof cached['find'] !== 'function') CACHE.set('user_combat_items', create_user_combat_items(cached['items']));
            return;
        }
        const url = 'https://dogonline.net/api/trpc/doghouse.getState';
        const response = await get_response_from_url(url);
        await update_user_combat_items_from_response(response);
    };

    // save tower state
    const update_raw_tower_state_from_response = (response, already_decoded = false, index = 0) => {
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
    const banish_conversion_entire_queue = (target = pending_weapon_use?.enemy ?? CACHE.get('prev')?.['mob'] ?? get_queue()?.[0]) => {
        const target_hp = remember_original_enemy_hp(target);
        if (target_hp === null) return false;
        for (const queue of Object.values(CACHE.get('enemy_queue') ?? {})) {
            if (!Array.isArray(queue)) continue;
            for (const enemy of queue) {
                if (enemy.name !== target.name) {
                    // note: converted enemies from banish lose their clone status
                    Object.assign(enemy, { name: target.name, image: target.image, hp: target_hp, maxHp: target_hp, clone: false });
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
            get_queue()?.[0]?.['clone'] === true
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
            get_queue()?.[0]?.['clone'] === true
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
        const died = (
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

        if (weapon === 'Flowering Sakura Stick' && !effects.banish && enemy_was_banished()) {
            if (banish_conversion_entire_queue(action.enemy)) {
                effects.banish = true;
                mark_enemy_removal_pending(true);
            }
        }

        if (died) {
            get_session_stats().slain++;
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
        if (revision !== tower_revision) return turns;

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
                if (upcoming_mobs.timer !== timer || CACHE.get('upcoming_mobs') !== upcoming_mobs) return;
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

    const update_mob_queue_css_variables = () => {
        const stats = document.querySelector('#tower-stats');
        if (stats === null) return;

        update_current_mob_grayscale_animation();
        update_mob_queue_masks();
        update_upcoming_mobs();

        const main = document.querySelector('main[class^="Layout_main"], main[class*=" Layout_main"]');
        if (main === null) return;

        const { top, left } = main.getBoundingClientRect();

        stats.style.setProperty('--top', `${top}px`);
        stats.style.setProperty('--left', `${left}px`);
    }

    let mob_queue_style_ready = false;

    const mob_queue_info_update = () => {
        if (!mob_queue_style_ready) {
            const style = document.getElementById('tower-stats-style') ?? document.createElement('style');
            style.id = 'tower-stats-style';
            style.textContent = `
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
                #tower-stats-loot-list {
                    --mask-height: 24px;
                    --internal-offset: 0.01;
                    --base-width: 216px;
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
                    padding: 0;

                    overflow-y: scroll;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(var(--scrollbar-handle-r), var(--scrollbar-handle-g), var(--scrollbar-handle-b), 0.75) rgba(var(--scrollbar-base-r), var(--scrollbar-base-g), var(--scrollbar-base-b), 0.525);

                    position: relative;
                    width: var(--width);
                    left: var(--left);
                    max-height: 110px;
                    min-height: 110px;
                    padding-left: 8px;

                    /* put scrollbar on left side */

                    direction: rtl;
                    * {
                        direction: ltr;
                    }

                    div.tower-stats-loot-list-item {
                        display: flex;
                        flex-direction: row;
                        justify-content: flex-start;
                        align-items: center;
                        gap: 6px;
                        margin: 0;
                        padding: 0;

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
            document.head.appendChild(style);
            mob_queue_style_ready = true;
        }

        if (document.body.querySelector('#tower-stats') === null) {
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
            stats.appendChild(lower);
            stats.appendChild(slain);
            stats.appendChild(loot);
            stats.appendChild(looted);

            document.body.appendChild(stats);
        }

        const queue = document.getElementById('tower-stats-queue');
        queue.onscroll = update_mob_queue_masks;
        queue.replaceChildren(); // empty children

        const enemies = get_queue() ?? [];
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
            for (const entry of session.loot) {
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
            looted.replaceChildren(list);
        }
        update_mob_queue_css_variables();
    }

    const mob_queue_info_show = () => {
        const stats = document.body.querySelector('#tower-stats');
        if (stats === null) return;
        stats.style.display = 'flex';
        update_mob_queue_css_variables();
    }

    const mob_queue_info_hide = () => {
        const stats = document.body.querySelector('#tower-stats');
        if (stats === null) return;
        stats.style.display = 'none';
    }

    // handle all state changes in response
    const process_deferred_response = (body, indices, turns = null, request_id = 0, revision = tower_revision) => {
        if (revision !== tower_revision) return;
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

                if (status.mob.visible) {
                    mob_queue_info_show();
                } else {
                    mob_queue_info_hide();
                }
            } finally {
                // finish only the matching action
                const banish_resolved = item?.['name'] === 'Flowering Sakura Stick' && action?.effects.banish;
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

        window.fetch = async (...args) => {
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
            if (indices.length > 0) {
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
    };

    // clear the finished tower run
    const clear_tower_tracking = () => {
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
        session.loot.length = 0;
        localstorage_save();
        console.info('Tower tracking cleared.');
    };

    const setup_display_callbacks = () => {
        const element = document.getElementById('__next');

        const mutation = new MutationObserver(update_mob_queue_css_variables);
        mutation.observe(element, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
        });

        const resize = new ResizeObserver(update_mob_queue_css_variables);
        resize.observe(element);
        const queue = document.getElementById('tower-stats-queue');
        if (queue !== null) resize.observe(queue);
        const looted = document.getElementById('tower-stats-loot-list');
        if (looted !== null) resize.observe(looted);

        const intersection = new IntersectionObserver(update_mob_queue_css_variables);
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


    CACHE.set('initalized', false);
    patch_console_logging();

    console.override('Initializing TOWER-TRACKER.js...');

    setup_action_tracking();
    localstorage_restore();
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
    await get_tower_state_when_running_script_for_first_time();

    mob_queue_info_update();
    setup_display_callbacks();

    CACHE.set('initalized', true);

    // so the user knows we've successfully installed the tracker for this session
    console.override('TOWER-TRACKER.js has initialized!');
})());

await(async () => {
    const WINDOW_KEY = '__DOGONLINE_INVENTORY_INFO_TEMP_STORAGE_WINDOW_KEY__';
    const EMBEDDED_HTML_WRAPPER_CLASS = 'item-has-html-in-its-description-and-this-is-a-wrapper-to-indicate-such';
    const NON_CATEGORIES = ['categories', 'consumedByDog', 'description', 'count', 'id', 'image', 'name', 'price'];
    const PARSER = new DOMParser();

    let FINISHED_COPYING = null;

    console.log('----------------------------------------------------------');

    const fetch_inventory = async () => {
        console.warn('Current session does not have data pulled yet, attempting to do so now!');
        const url = 'https://dogonline.net/api/trpc/doghouse.getState,messages.list,toys.getActiveToyWidgets';
        const body = {
            batch: 1,
            input: {
                "0": {
                    "json": null,
                    "meta": {
                        "values": ["undefined"],
                        "v": 1
                    }
                },
                "1": {
                    "json": null,
                    "meta": {
                        "values": ["undefined"],
                        "v": 1
                    }
                },
                "2": {
                    "json": null,
                    "meta": {
                        "values": ["undefined"],
                        "v": 1
                    }
                }
            }
        };
        const cookie = '__Secure-better-auth.session_token';
        const session = document.cookie.split("; ").find(row => row.startsWith(`${cookie}=`))?.split("=")[1];
        const headers = new Headers();
        const qs = new URLSearchParams({
            batch: String(body.batch),
            input: JSON.stringify(body.input),
        }).toString();
        headers.set('Accept', '*/*');
        headers.set('Accept-Encoding', 'gzip, deflate, br, zstd');
        headers.set('Accept-Language', 'en-US,en;q=0.9');
        headers.set('Connection', 'keep-alive');
        headers.set('Cookie', `${cookie}=${session}`);

        const request = {
            url: `${url}?${qs}`,
            body: {
                method: 'GET',
                headers: headers
            }
        }

        console.warn('Attempting to send request:', request);
        try {
            const response = await fetch(request.url, request.body);
            if (!response.ok) {
                throw new Error(`Error fetching data from dogonline. Status: ${response.status}`);
            }
            console.log('Response recieved and was successful!', response);
            window[WINDOW_KEY]['data'] = await response.json();
            console.log(`The fetched data can be viewed by typing the following into the browser console: %cwindow.${WINDOW_KEY}.data`, 'font-family: monospace;');
        } catch (err) {
            throw new Error(`Failed while attempting to fetch!`, err);
        }
    }

    const fetch_closet = async () => {
        console.warn('Current session does not have closet pulled yet, attempting to do so now!');
        const url = 'https://dogonline.net/api/trpc/dressup.getState';
        const body = {
            batch: 1,
            input: {
                "0": {
                    "json": { "dogIndex": null },
                    "meta": {
                        "values": { dogIndex: ["undefined"] },
                        "v": 1
                    }
                }
            }
        };
        const cookie = '__Secure-better-auth.session_token';
        const session = document.cookie.split("; ").find(row => row.startsWith(`${cookie}=`))?.split("=")[1];
        const headers = new Headers();
        const qs = new URLSearchParams({
            batch: String(body.batch),
            input: JSON.stringify(body.input),
        }).toString();
        headers.set('Accept', '*/*');
        headers.set('Accept-Encoding', 'gzip, deflate, br, zstd');
        headers.set('Accept-Language', 'en-US,en;q=0.9');
        headers.set('Connection', 'keep-alive');
        headers.set('Cookie', `${cookie}=${session}`);

        const request = {
            url: `${url}?${qs}`,
            body: {
                method: 'GET',
                headers: headers
            }
        }

        console.warn('Attempting to send request:', request);
        try {
            const response = await fetch(request.url, request.body);
            if (!response.ok) {
                throw new Error(`Error fetching data from dogonline. Status: ${response.status}`);
            }
            console.log('Response recieved and was successful!', response);
            window[WINDOW_KEY]['closet'] = await response.json();
            console.log(`The fetched data can be viewed by typing the following into the browser console: %cwindow.${WINDOW_KEY}.closet`, 'font-family: monospace;');
        } catch (err) {
            throw new Error(`Failed while attempting to fetch!`, err);
        }
    }

    const startup = async () => {
        window[WINDOW_KEY] = {};
        await fetch_inventory();
        await fetch_closet();

        window[WINDOW_KEY]['functions'] = {};

        window[WINDOW_KEY]['functions']['getDogOnlineData'] = (...fields) => {
            const base = window[WINDOW_KEY]['data'];
            let current = base;
            for (field of fields) {
                current = current[field];
            }
            return structuredClone(current);
        }

        window[WINDOW_KEY]['functions']['getDogOnlineDataMain'] = () => window[WINDOW_KEY]['functions']['getDogOnlineData'](0, 'result', 'data', 'json');
        window[WINDOW_KEY]['functions']['getDogOnlineCloset'] = () => window[WINDOW_KEY]['closet'][0]['result']['data']['json']['cosmetics'];
    };

    await startup();

    const dogdata = () => window[WINDOW_KEY]['functions']['getDogOnlineDataMain']();
    const dogcloset = () => window[WINDOW_KEY]['functions']['getDogOnlineCloset']();

    const inventory = structuredClone(dogdata().inventory);
    const internal_categories = new Set();

    inventory.forEach(
        item => {
            Object.keys(item).forEach(key => internal_categories.add(key));
            item.categories.forEach(key => internal_categories.add(key));
        }
    );
    NON_CATEGORIES.forEach(key => internal_categories.delete(key));
    internal_categories.add('closet');
    const isCategory = (item, category) => {
        if (Object.hasOwn(item, category)) {
            if (item[category] !== null && item[category] !== false) {
                return true;
            }
        }
        if (Array.isArray(item.categories) && item.categories.length > 0) {
            if (item.categories.some(itemCategory => itemCategory === category)) {
                return true;
            }
        }
        return false;
    }
    const sorted_by_category = {};
    internal_categories.forEach(internalCategory => {
        sorted_by_category[internalCategory] = [];
    });
    inventory.forEach(item => {
        internal_categories.forEach(category => {
            if (isCategory(item, category)) {
                sorted_by_category[category].push(item);
            }
        });
    });

    structuredClone(dogcloset()).forEach(item => {
        sorted_by_category['closet'].push(item);
    });

    const categorized = [...(new Set(Object.values(sorted_by_category).flat()))];
    const uncategorized = [...(new Set(inventory))].filter(item => !(new Set(categorized)).has(item));

    sorted_by_category['cosmetic'] = [...(new Set([...sorted_by_category['isCosmetic'], ...sorted_by_category['cosmetic']]))];
    delete sorted_by_category['isCosmetic'];

    sorted_by_category['uncategorized'] = uncategorized;

    const embedded_html = new Set();

    const uuidToDogName = uuid => dogdata().dogs.find(dog => dog?.uuid?.toLocaleLowerCase().trim() === uuid.toLocaleLowerCase().trim())?.name ?? 'Unknown dog name!';

    const all = [...(() => {
        const set = new Set();
        Object.entries(sorted_by_category).forEach(entry => {
            const [category, items] = entry;
            items.forEach(item => set.add(item));
        });
        return set;
    })()];

    const consume_check = item => {
        try {
            return ((item => Object?.keys(item?.consumedByDog)?.filter(uuid => item?.consumedByDog?.[uuid])?.map(uuidToDogName))(item))
        } catch (err) {
            return null;
        }
    };

    for (const item of all) {
        const dataset = {
            consumedByDog: consume_check(item),
            count: item.count,
            description: item.description?.split('\n')?.map(line => line.trim()),
            id: item.id?.trim(),
            image: new URL(item.image.trim(), 'https://dogonline.net/').href,
            name: item.name?.trim(),
            price: item.price,
            provides: (item.provides === undefined || (item.book === null && item.food === null)) ? null : structuredClone({
                ...((item.book !== null && typeof item.book === 'object') ? item.book : {}),
                ...((item.food !== null && typeof item.food === 'object') ? item.food : {}),
            })
        };

        // mutate in place
        Object.keys(item).forEach(key => delete item[key]);
        Object.entries(dataset).forEach(entry => {
            const [key, value] = entry;
            item[key] = value;
        })

        if ((() => {
            const doc = PARSER.parseFromString(item.description, 'text/html');
            const nodes = doc.querySelector('html body')?.querySelectorAll('*') ?? [];
            return nodes.length > 0;
        })()) {
            embedded_html.add(item);
        }
    }

    const signatures = new Set();

    embedded_html.forEach(item => {
        item.description = `<div class="${EMBEDDED_HTML_WRAPPER_CLASS}">${item.description}</div>`;
        const doc = PARSER.parseFromString(item.description, 'text/html');
        const root = doc.querySelector(`html body div.${EMBEDDED_HTML_WRAPPER_CLASS}`);
        root.querySelectorAll('*').forEach(node => {
            signatures.add(`<${node.tagName.toLocaleLowerCase()}${node.className.trim().length === 0 ? '' : ` class="${node.className.trim()}"`}>`);
        });
    });

    const combatBaseDescription = parent => {
        if (!parent) return "";
        let extracted = "";
        const traverse = node => {
            if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('modal-combat-title')) return false;
            if (node.nodeType === Node.TEXT_NODE) extracted += node.textContent;
            else if (node.nodeName === 'BR') extracted += '\n';
            for (let child of node.childNodes) {
                const keepGoing = traverse(child);
                if (!keepGoing) return false;
            }
            return true;
        }
        traverse(parent);
        return extracted.trim();
    }

    const non_combat_items_with_html = new Set([...embedded_html]);

    embedded_html.forEach(item => {
        const doc = PARSER.parseFromString(item.description, 'text/html');
        const root = doc.querySelector(`html body div.${EMBEDDED_HTML_WRAPPER_CLASS}`);
        const title = root.querySelector('div.modal-combat-title');
        const stats = root.querySelectorAll('div.modal-combat-stat-line');
        if (title !== null || stats.length > 0) {
            item.description = {
                text: combatBaseDescription(root).split('\n').map(line => line.trim()).filter(line => line !== ''),
                title: title?.textContent ?? '',
                stats: structuredClone(stats.length > 0 ? [...stats.values()].map(line => line.textContent.trim()).filter(line => line !== '') : []).map(line => {
                    const matches = /^\s*(.+?)\s*:\s*(.+?)\s*$/.exec(line);
                    if (matches.length !== 3) return line;
                    return {
                        field: matches[1].trim(),
                        value: matches[2].trim()
                    }
                }),
            };
            non_combat_items_with_html.delete(item);
        }
    });

    [...non_combat_items_with_html].forEach(item => {
        const doc = PARSER.parseFromString(item.description, 'text/html');
        const root = doc.querySelector(`html body div.${EMBEDDED_HTML_WRAPPER_CLASS}`);
        if (root) {
            const replaced = root.innerHTML.replace(/<br\s*\/?>/gi, '\n');
            const div = document.createElement('div');
            div.innerHTML = replaced;
            item.description = div.textContent.split('\n').map(line => line.trim()).filter(line => line !== '');
        } else {
            item.description = [];
        }
    })

    const non_consumables = all.filter(item => ![...(new Set([...sorted_by_category['food'], ...sorted_by_category['book']]))].includes(item));
    non_consumables.forEach(item => { delete item['consumedByDog']; });

    all.filter(item => item.provides === null).forEach(item => { delete item['provides']; });

    const blob_to_data_url = blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

    const image_data_cache = new Map();
    const fetch_image_data_url = source => {
        if (source.startsWith('data:')) return Promise.resolve(source);
        const url = new URL(source, location.href);
        if (url.origin !== location.origin) {
            throw new Error(`Not on dogonline.net???`);
        }
        if (!image_data_cache.has(url.href)) {
            image_data_cache.set(url.href, (async () => {
                const response = await fetch(url.href, {
                    mode: 'same-origin',
                    credentials: 'same-origin',
                    signal: AbortSignal.timeout(30000),
                });
                if (!response.ok) throw new Error(`Image request failed (${response.status}): ${url.href}`);
                const blob = await response.blob();
                if (!blob.type.startsWith('image/')) {
                    throw new Error(`Expected image, got ${blob.type || 'something???'}: ${url.href}`);
                }
                return blob_to_data_url(blob);
            })());
        }
        return image_data_cache.get(url.href);
    };

    let next_image_index = 0;
    let embedded_image_count = 0;
    console.log(`Embedding images for ${all.length} items...`);
    await Promise.all(Array.from({ length: Math.min(4, all.length) }, async () => {
        while (next_image_index < all.length) {
            const item = all[next_image_index++];
            item.image = await fetch_image_data_url(item.image);
            embedded_image_count++;
            if (embedded_image_count % 25 === 0 || embedded_image_count === all.length) {
                console.log(`Images embedded: ${embedded_image_count}/${all.length}`);
            }
        }
    }));


    const finalized = {
        image_base_url: '',
        inventory: Object.fromEntries(Object.entries(sorted_by_category).filter(entry => {
            const [section, array] = entry;
            return array.length > 0;
        })),
        does_this_work: true,
    };

    console.log(`There are >>> ${embedded_html.size} <<< items with embedded html!`);
    console.log(`There are >>> ${signatures.size} <<< unique DOM element signatures!`);
    console.log('----------------------------------------------------------');
    console.log(
        [
            `%cTotals:`,
            `  - Unique inventory items: ${all.length}`,
            `  - Non-consumables: ${non_consumables.length}`,
            `  - Uncategorized: ${sorted_by_category['uncategorized'].length}`,
            `  - Non-Combat Items with HTML: ${non_combat_items_with_html.size}`
        ].join('\n'),
        'font-family: monospace;'
    );

    window[WINDOW_KEY].finalized = finalized;
    console.log(`Parsed data saved to '%cwindow.${WINDOW_KEY}.finalized%c'!`, 'font-family: monospace;', '')
    console.log('Fetched data:', window[WINDOW_KEY]['data']);
    console.log('Parsed data:', finalized);

    const compress = async text => {
        const bytes = new TextEncoder().encode(text);
        const stream = new Response(bytes).body.pipeThrough(new CompressionStream('gzip'));
        const blob = await new Response(stream).blob();
        const data_url = await blob_to_data_url(blob);
        return data_url.slice(data_url.indexOf(',') + 1);
    }

    window[WINDOW_KEY].compress = compress;

    const hyphenize = text => text.padStart(Math.floor((120 + text.length) / 2), '-').padEnd(120, '-');

    const base64_data_split_120_chars = [
        '',
        hyphenize('BEGIN-COMPRESSED-BASE64-ENCODED-OUTPUT'),
        ...((await compress(JSON.stringify(finalized))).match(/.{1,120}/g) ?? []),
        hyphenize('END-COMPRESSED-BASE64-ENCODED-OUTPUT'),
        ''
    ].join('\n');

    window[WINDOW_KEY].encoded = base64_data_split_120_chars.trim();

    Object.defineProperty(window, 'DOGDATA', {
        get() {
            navigator.clipboard.writeText(base64_data_split_120_chars.trim())
                .then(() => {
                    console.log(`Copied ${base64_data_split_120_chars.trim().length} characters to the clipboard. (That's a lot of characters...)`);
                    if (FINISHED_COPYING !== null && typeof FINISHED_COPYING === 'function') {
                        FINISHED_COPYING();
                    }
                })
                .catch(err => {
                    console.error('Failed to copy to clipboard automatically???: ', err);
                });
            return null;
        },
        enumerable: true,
        configurable: true,
    });

    if (window['getStyleObject'] === undefined) {
        window['getStyleObject'] = element => {
            const computed = getComputedStyle(element);
            const styles = {};
            for (const key in computed) {
                if (isNaN(key) && computed[key] !== undefined) {
                    styles[key] = computed[key];
                }
            }
            return styles;
        };
    }

    const add_physical_button = () => {
        const styles = {
            overlay: {
                backgroundColor: 'rgba(0,0,0,0.65)',
                position: 'fixed',
                inset: '0',
                display: 'grid',
                placeItems: 'center',
                overflowY: 'auto',
                zIndex: '999',
                pointerEvents: 'auto',
            },
            modal: {
                pointerEvents: 'auto',
                backgroundColor: 'var(--surface-bg)',
                borderRadius: '10px',
                width: '90vw',
                maxWidth: '500px',
                padding: '30px',
                textAlign: 'center',
            },
            body: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                pointerEvents: 'auto',
            },
            inner: {
                margin: '15px auto',
                maxWidth: '330px',
                justifyContent: 'center',
                flex: '1 1',
                display: 'flex',
                flexFlow: 'column',
                pointerEvents: 'auto',
            },
            dialogue: {
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                pointerEvents: 'auto',
            },
            button: {
                backgroundColor: 'color-mix(in srgb, #2f64c0 50%, #4d8eff)',
                border: '3px solid',
                borderColor: 'color-mix(in srgb, #1f4a94 50%, #0771c2)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '12px',
                padding: '0 20px',
                fontSize: '24px',
                fontFamily: 'inherit',
                fontWeight: '400',
                minHeight: '45px',
                color: 'white',
                userSelect: 'none',
                textDecoration: 'none',
                flexDirection: 'column',
                pointerEvents: 'auto',
                position: 'relative',
                top: '0px',
                left: '0px',
            },
            status: {
                userSelect: 'none',
                display: 'none',
            }
        };

        const overlay = document.createElement('div');
        const modal = document.createElement('div');
        const body = document.createElement('div');
        const inner = document.createElement('div');
        const dialogue = document.createElement('div');
        const header = document.createElement('h2');
        const button = document.createElement('button');
        const status = document.createElement('div');

        Object.assign(overlay.style, styles.overlay);
        Object.assign(modal.style, styles.modal);
        Object.assign(body.style, styles.body);
        Object.assign(inner.style, styles.inner);
        Object.assign(dialogue.style, styles.dialogue);
        Object.assign(button.style, styles.button);
        Object.assign(status.style, styles.status);

        header.textContent = 'DOGDATA'
        button.textContent = 'Copy inventory data to clipboard';
        button.type = 'button';

        status.textContent = 'You can close this dialogue box now by clicking anywhere outside of it.';

        dialogue.appendChild(header);
        dialogue.appendChild(button);
        dialogue.appendChild(status);
        inner.appendChild(dialogue);
        body.appendChild(inner);
        modal.appendChild(body);
        overlay.appendChild(modal);

        document.body.appendChild(overlay);

        const originals = {
            button: getStyleObject(button),
        }

        const states = {
            button: { pressed: false, listeners: null, backdrop: false },
        };

        const update_button = hovered => {
            const pressed = states.button.pressed && hovered;
            button.style.backgroundColor = pressed
                ? '#1c4792'
                : hovered
                    ? '#2e5ba8'
                    : originals.button.backgroundColor;
            button.style.borderColor = pressed
                ? 'rgb(10, 48, 89)'
                : hovered
                    ? 'rgb(20, 66, 115)'
                    : originals.button.borderColor;
            button.style.top = pressed ? '2px' : originals.button.top;
            button.style.left = pressed ? '2px' : originals.button.left;
            button.style.color = pressed ? '#aaa' : originals.button.color;
        }

        const release_button = () => {
            states.button.pressed = false;
            states.button.listeners?.abort();
            states.button.listeners = null;
            update_button(button.matches(':hover'));
        }

        overlay.onmousedown = function (evt) {
            if (evt.button === 0) states.button.backdrop = evt.target === this;
        }

        overlay.onmouseup = function (evt) {
            if (evt.button === 0 && evt.target !== this) states.button.backdrop = false;
        }

        overlay.onclick = function (evt) {
            if (evt.target !== this || !states.button.backdrop) return;
            states.button.backdrop = false;
            release_button();
            this.remove();
        }

        button.onmouseenter = function (evt) {
            if ((evt.buttons & 1) === 0) release_button();
            update_button(true);
        }

        button.onmouseleave = function (evt) {
            update_button(false);
        }

        button.onmousedown = function (evt) {
            if (evt.button !== 0) return;
            release_button();
            states.button.pressed = true;
            states.button.listeners = new AbortController();
            const release = evt => {
                if (evt.type === 'mouseup' && evt.button !== 0) return;
                if (evt.type === 'blur') states.button.backdrop = false;
                release_button();
            };
            const signal = states.button.listeners.signal;
            window.addEventListener('mouseup', release, { capture: true, signal });
            window.addEventListener('blur', release, { signal });
            window.addEventListener('pointercancel', release, { capture: true, signal });
            window.addEventListener('contextmenu', release, { capture: true, signal });

            update_button(true);
        }

        button.onclick = function (evt) {
            button.textContent = 'Copying...';
            FINISHED_COPYING = () => {
                button.textContent = 'Copied!';
                status.style.display = '';
            };
            DOGDATA;
        }
    }

    add_physical_button();

    console.log(base64_data_split_120_chars);
    console.log('Paste the above data into the tool.\n\nAdditionally, you can type %cDOGDATA%c into the console and press Enter to copy it that way.\n\nMake sure that you have clicked /literally/ anywhere on the webpage before attempting to do so though because otherwise it doesn\'t work for some reason???', 'font-family: monospace; font-weight: bold', '');
    console.log('LASTLY: If you wish to update the DOGDATA that is pulled, you must refresh. This is just a simple gate to prevent spam-pasting the script into the console. Mitigation, you know?');
    console.log('-----------------------');
    console.log('EDIT: NEVERMIND I HAVE FINALLY ADDED A PHYSICAL BUTTON!');
})();

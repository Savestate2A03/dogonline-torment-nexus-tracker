// same as before, paste into the console
// horrible horrible but it works LOL
if (window['UNINSTALL_RODIN'] !== undefined) UNINSTALL_RODIN();
UNINSTALL_RODIN = (()=>{
    const KEY = '__PUMPKIN_WEEK_HACK__';
    const STYLE = `

    @keyframes horizontal-shaking-1 {
        0% { transform: translateX(0) }
        25% { transform: translateX(1px) }
        50% { transform: translateX(-1px) }
        75% { transform: translateX(1px) }
        100% { transform: translateX(0) }
    }

    @keyframes horizontal-shaking-2 {
        0% { transform: translateX(0) }
        25% { transform: translateX(2px) }
        50% { transform: translateX(-2px) }
        75% { transform: translateX(2px) }
        100% { transform: translateX(0) }
    }

    @keyframes no-shaking {
        0% { transform: translateX(0) }
        25% { transform: translateX(0) }
        50% { transform: translateX(0) }
        75% { transform: translateX(0) }
        100% { transform: translateX(0) }
    }

    @keyframes figure-eight-horizontal {
        from { translate: calc(-1 * var(--x-offset)) 0; }
        to { translate: var(--x-offset) 0; }
    }

    @keyframes figure-eight-vertical {
        from { translate: 0 calc(-1 * var(--y-offset)); }
        to { translate: 0 var(--y-offset); }
    }

    #hack-overlay::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(255, 255, 255, 0.0);
        pointer-events: none;
        z-index: 9999999;
        transition: background-color 2s ease-in;
    }

    #hack-overlay.semi-white::before {
        background-color: rgba(255, 255, 255, 0.5);
    }

    #hack-overlay.white::before {
        background-color: rgba(255, 255, 255, 1.0);
        transition: background-color 0.0s ease-in;
    }

    #hack-overlay {
        max-width: 780px;
        margin: 16px auto;
        padding: 0 32px;
        background-color: var(--surface-bg);
        border-radius: 6px;
        border: 2px solid var(--surface-border);
        position: relative;
        overflow: hidden;

        &.scary {

            #hack-gameplay {
                #hack-portrait {
                    opacity: 0.0;

                    &.reveal {
                        opacity: 1.0;
                        transition: opacity 0.6s ease-in-out 2.25s;
                    }
                }
                #hack-player-row {
                    opacity: 0.0;

                    &.reveal {
                        opacity: 1.0;
                        transition: opacity 0.6s ease-in-out 2.25s;
                    }
                }
                #hack-button-section-2 {
                    opacity: 0.0;

                    &.reveal {
                        opacity: 1.0;
                        transition: opacity 0.6s ease-in-out 2.25s;
                    }
                }
                #hack-event-container {
                    opacity: 0.0;

                    &.show-scary {
                        transition: opacity 0.5s ease-in-out 1s;
                        opacity: 1.0;
                    }
                }
            }

            background-color: rgb(0, 0, 0);
        }
    }
    #hack-content {
        padding: 32px;
        text-align: center;
        margin: auto auto 2rem;
    }
    #hack-gameplay {
        display: flex;
        flex-direction: column;
        align-items: center;
        
        * {
            user-select: none;
        }
    }
    #hack-portrait {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        margin-bottom: 15px;
        width: 300px;
    }
    #hack-portrait-image-container {
        position: relative;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        width: 100%;
        height: 100%;
    }
    #hack-mob-sprite {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: flex-end;
        justify-content: center;

        img {
            max-height: 85%;
            image-rendering: pixelated;

            filter: brightness(1) invert(0);
            
            &.shake {
                filter: brightness(0) invert(1);
                transition: filter 2s ease-in-out 3.25s;
            }

            &.figure-eight {
                --x-offset: 60px;
                --y-offset: 40px;
                --animation-duration: 2.5s;
                animation:
                    figure-eight-horizontal var(--animation-duration) ease-in-out calc(-0.5 * var(--animation-duration)) alternate infinite,
                    figure-eight-vertical calc(0.5 * var(--animation-duration)) ease-in-out calc(-0.25 * var(--animation-duration)) alternate infinite,
                    enemy-ghost-glow 2s linear infinite;
                animation-composition: replace, add, replace;
            }
        }
    }
    #hack-hp-bar {
        position: relative;
        width: 200px;
        height: 42px;
        margin-top: 5px;

        img.life {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            z-index: 2;
            pointer-events: none;
        }

        span.health {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            text-align: center;
            z-index: 3;
            margin: 0;
            line-height: 42px;
            text-shadow: 1px 1px 2px black;
            color: white;
            pointer-events: none;
        }

        div.bar {
            background: url(/img/tower/tower_ui_lifebar_bg.png);
            position: absolute;
            height: 75%;
            top: 10%;
            left: 5%;
            transition: width .3s ease;
        }
    }
    #hack-event-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 15px;
        margin-bottom: 20px;
    }
    #hack-event-portrait {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 20px;
        width: 200px;
        height: 200px;

        img {
            width: 100%;
            height: 100%;
        }
    }
    #hack-tui-textbox {
        position: relative;
        background-color: #222;
        color: white;
        padding: 25px 35px;
        border-radius: 8px;
        max-width: 400px;
        text-align: center;
        min-height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;

        &.inactive {
            pointer-events: none;
        }

        p {
            margin: 0;
            white-space: pre-wrap;
            -webkit-user-select: none;
            -moz-user-select: none;
            user-select: none;

            span.hidden {
                opacity: 0.0;
            }
        }

        div.next-arrow {
            position: absolute;
            right: 10px;
            bottom: 5px;
            width: 40px;
            height: 20px;
            background-image: url(/img/tower/tower_ui_arrow.gif);
            background-repeat: no-repeat;
        }
    }
    #hack-tui-text-static {
        max-width: 400px;

        p {
            text-align: center;
        }
    }
    #hack-tui-loot-display {
        display: flex;
        align-items: center;

        div {
            display: flex;
            gap: 8px;
            margin-bottom: 20px;
        }
    }
    #hack-player-row {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 30px;
        margin-bottom: 30px;
    }
    #hack-player-portrait {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
    }
    #hack-player-portrait-fx {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    #hack-player-portrait-name {
        margin: 0;
        text-align: center;
    }
    #hack-player-hp-bar {
        position: relative;
        width: 150px;
        height: 30px;
        margin: 0;

        img.life {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            z-index: 2;
            pointer-events: none;
        }

        span.life {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            text-align: center;
            z-index: 3;
            margin: 0;
            line-height: 30px;
            text-shadow: 1px 1px 2px black;
            color: white;
            pointer-events: none;
        }

        div.bar {
            background: url(/img/tower/tower_ui_lifebar_bg.png);
            position: absolute;
            height: 75%;
            top: 10%;
            left: 5%;
            transition: width .3s ease;
        }
    }
    #hack-combat-items {
        display: grid;
        grid-template-columns: repeat(2,110px);
        grid-template-rows: repeat(2,110px);
        grid-gap: 8px;
        gap: 8px;

        div.cell {
            position: relative;
            border: 3px solid #333;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            background: transparent;
            overflow: hidden;

            &:hover {
                background-color: #fffacd;
                transform: scale(1.05);
            }

            &:active {
                transform: scale(.95);
            }

            img {
                width: 100%;
                height: 100%;
                object-fit: contain;
            }
        }
    }
    #hack-button-section-2 {
        display: flex;
        flex-direction: row;
        gap: 12px;
        flex-wrap: wrap;
        justify-content: center;
        margin-top: 10px;
        
        button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 12px;
            padding: 0 20px;
            font-size: 24px;
            font-family: inherit;
            font-weight: 400;
            border: 3px solid;
            border-top-color: currentcolor;
            border-right-color: currentcolor;
            border-bottom-color: currentcolor;
            border-left-color: currentcolor;
            min-height: 45px;
            color: white;
            -webkit-user-select: none;
            -moz-user-select: none;
            user-select: none;
            text-decoration: none;
            flex-direction: column;

            position: relative;
            top: 0px;
            left: 0px;

            &.danger {
                background-color: #c0392b;
                border-color: #962a1f;

                &:hover {
                    background-color: #a33024;
                    border-color: #7c2219;
                }

                &.gone {
                    transition: left 0.4s ease-out 2s;
                    left: -400px;
                }
            }

            &.neutral {
                background-color: #2f64c0;
                border-color: #1f4a94;

                &:hover {
                    background-color: #24529f;
                    border-color: #183b78;
                }

                &.gone {
                    transition: left 0.4s ease-out 2.5s;
                    left: 400px;
                }
            }
        }
    }
    `;
    const ELEMENTS = `
        <main id="hack-overlay">
            <div id="hack-content">
                <div id="hack-gameplay">
                    <div id="hack-portrait">
                        <div id="hack-portrait-image-container">
                            <img src="/img/tower/tower_ui_door.png" />
                            <div id="hack-mob-sprite">
                                <img src="/img/tower/enemy_pupcup.png" />
                            </div>
                        </div>
                        <div id="hack-hp-bar">
                            <img class="life" src="/img/tower/tower_ui_lifebar.png">
                            <span class="health">12 / 12</span>
                            <div class="bar" style="width: 90%;"></div>
                        </div>
                    </div>
                    <div id="hack-event-container">
                        <div id="hack-event-portrait" style="display: none;">
                            <img src="">
                        </div>
                        <div id="hack-tui-textbox">
                            <p></p>
                            <div class="next-arrow"></div>
                        </div>
                        <div id="hack-tui-text-static" style="display: none;">
                            <p></p>
                        </div>
                        <div id="hack-tui-loot-display" style="display: none;">
                            <div></div>
                        </div>
                    </div>
                    <div id="hack-player-row">
                        <div id="hack-player-portrait">
                            <div id="hack-player-portrait-fx"></div>
                            <span id="hack-player-portrait-name">Rei</span>
                            <div id="hack-player-hp-bar">
                                <img class="life" src="/img/tower/tower_ui_lifebar.png">
                                <span class="life">5 / 5</span>
                                <div class="bar" style="width: 90%;"></div>
                            </div>
                        </div>
                        <div id="hack-combat-items">
                            <div class="cell">
                                <img src="/img/item_blongus_sword.png">
                            </div>
                            <div class="cell">
                                <img src="/img/item_rockos_ship.png">
                            </div>
                            <div class="cell">
                                <img src="/img/item_blongus_wand.png">
                            </div>
                            <div class="cell">
                                <img src="/img/item_sapphireshiversabre.png">
                            </div>
                        </div>
                    </div>
                    <div id="hack-button-section-2">
                        <button class="danger" type="button">Leave the Tower</button>
                        <button class="neutral">Run from Battle</button>
                    </div>
                </div>
            </div>
        </main>
    `;

    const parse_html = html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return doc.body.firstElementChild;
    }

    const style = document.getElementById('hack-week-style') ?? document.createElement('style');
    style.id = 'hack-week-style';
    style.textContent = STYLE;
    document.head.appendChild(style);

    const NEXT = document.getElementById('__next');
    const MAIN = NEXT.querySelector('[class^="Layout_main"]');
    MAIN.after(parse_html(ELEMENTS));

    const ORIGINAL_PORTRAIT_LOCATION = NEXT.querySelector('div[class^="tower_playerPortraitFx__"]');
    const PORTRAIT = NEXT.querySelector('div[class^="tower_playerPortraitFx__"] div[class^="DogRenderer_portrait__"]');
    document.getElementById('hack-player-portrait-fx').appendChild(PORTRAIT);

    MAIN.style.display = "none";

    const TEXTBOX_LINE_MANAGER = {
        messages: [],
        current: null,
        timeout: null,
        pick_next: function () {
            clearTimeout(this.timeout);
            this.timeout = null;
            if (this.messages.length !== 0) {
                const msg = this.messages.shift();
                if (msg.arrow) {
                    this.arrow().style.display = "";
                } else {
                    this.arrow().style.display = "none";
                }
                this.current = msg;
                this.textbox().style.display = "";
                if (msg.spell_out) spell_out_current_message();
                else this.text().textContent = msg.msg;
            } else {
                this.text().textContent = "";
                this.arrow().style.display = "none";
                this.current = null;
                this.textbox().style.display = "none";
            }
        },
        textbox: function () { return document.getElementById('hack-tui-textbox') },
        arrow: function () { return this.textbox().querySelector('.next-arrow') },
        text: function () { return this.textbox().querySelector('p'); },
        queue: function ({ msg, arrow = false, callback = null, spell_out = false, voice = null }) {
            this.messages.push({ msg, arrow, callback, spell_out, voice });
        },
        setup: function() {
            const button = this.arrow();
            button.onclick = () => {
                const current = this.current;
                if (current?.callback) {
                    current.callback();
                }
                if (this.current === current) this.pick_next();
            }
        }
    }

    const SOUNDS = {
        swing: 'https://sav.estate/files/snd_swing.wav',
        screenshake: 'https://sav.estate/files/snd_screenshake.wav',
        appear: 'https://sav.estate/files/snd_spearappear.wav',
        voice: 'https://sav.estate/files/snd_txtrud.wav',
        voice_jok: 'https://sav.estate/files/snd_txtjok.wav',
        dtrans: 'https://sav.estate/files/snd_dtrans_lw.ogg',
        petrify: 'https://sav.estate/files/snd_petrify.wav',
        whip: 'https://sav.estate/files/snd_whip_throw_only.wav',
        megalovania: 'https://sav.estate/files/226899939.mp3',
        ohno: 'https://sav.estate/files/230254864.mp3',
        square: 'https://sav.estate/files/snd_dtrans_square.ogg',
    }

    for (const sound of Object.keys(SOUNDS)) {
        const audio = (new Audio(SOUNDS[sound]));
        audio.load();
    }

    const play_sound = (sound, volume = 0.75) => {
        const audio = (new Audio(sound));
        audio.load();
        audio.volume = volume;
        audio.play().catch(error => {
            console.error("Playback failed. Ensure there was a user interaction first:", error);
        });
    }

    const SPRITES = {
        rodin: '/img/tower/enemy_rodin.png',
        rodin2: 'https://sav.estate/files/rodin2.png',
    };

    const change_mob_sprite = sprite => {
        const container = document.getElementById('hack-mob-sprite').querySelector('img').src = sprite;
    }

    const set_mob_health = (current, max) => {
        const bar = document.getElementById('hack-hp-bar');
        bar.querySelector('span.health').textContent = `${current} / ${max}`;
    }

    const spell_out_current_message = () => {
        clearTimeout(TEXTBOX_LINE_MANAGER.timeout);
        TEXTBOX_LINE_MANAGER.timeout = null;
        const message = TEXTBOX_LINE_MANAGER.current;
        if (message === null) return;
        const current = message.msg;
        const voice = message.voice;
        const text = TEXTBOX_LINE_MANAGER.text();
        const visible = document.createTextNode('');
        const hidden = document.createElement('span');
        hidden.className = 'hidden';
        hidden.textContent = current;
        text.replaceChildren(visible, hidden);
        let progress = 0;
        const reveal_next = () => {
            if (TEXTBOX_LINE_MANAGER.current !== message || !text.isConnected) return;
            if (progress === 0 && Number(getComputedStyle(text.closest('#hack-event-container')).opacity) < 1) {
                TEXTBOX_LINE_MANAGER.timeout = setTimeout(reveal_next, 750);
                return;
            }
            progress++;
            visible.textContent = current.substring(0, progress);
            hidden.textContent = current.substring(progress);
            TEXTBOX_LINE_MANAGER.timeout = null;
            if (progress < current.length) {
                TEXTBOX_LINE_MANAGER.timeout = setTimeout(reveal_next, 45);
            }
            if (voice === null) {
                play_sound(SOUNDS.voice, 0.135);
            } else if (voice === 'none') {

            } else {
                play_sound(voice, 0.135);
            }
        };
        if (current.length > 0) TEXTBOX_LINE_MANAGER.timeout = setTimeout(reveal_next, 500);
    }

    const delay = callback => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                callback();
            });
        });
    }

    const cleanup = () => {
        clearTimeout(TEXTBOX_LINE_MANAGER.timeout);
        TEXTBOX_LINE_MANAGER.timeout = null;
        ORIGINAL_PORTRAIT_LOCATION.appendChild(PORTRAIT);
        if (document.getElementById('hack-overlay') !== null) {
            document.getElementById('hack-overlay').remove();
            MAIN.style.display = "";
        }
    };

    const get_weapon = which => {
        const weapons = document.getElementById('hack-combat-items');
        const weapon = [...weapons.querySelectorAll('div.cell')][which-1];
        console.log(weapon);
        return weapon;
    };

    const one_time_click = (element, callback) => {
        element.onclick = () => {
            callback();
            element.onclick = "";
        };
    };

    const rodin_part_two = () => {
        TEXTBOX_LINE_MANAGER.queue({ msg: `tl;dr: eat kibble, fleabag`, arrow: false, spell_out: true, voice: SOUNDS.voice_jok});
        TEXTBOX_LINE_MANAGER.queue({ msg: `Rodin's sick of it!`, arrow: false, spell_out: false });
        TEXTBOX_LINE_MANAGER.queue({ msg: `What will you do?`, arrow: false, spell_out: false });
        TEXTBOX_LINE_MANAGER.pick_next();
        setTimeout(() => {
            TEXTBOX_LINE_MANAGER.pick_next();
            play_sound(SOUNDS.megalovania, 0.19);
            setTimeout(() => {
                document.getElementById('hack-mob-sprite').querySelector('img').classList.add('figure-eight');
                setTimeout(() => {
                    TEXTBOX_LINE_MANAGER.pick_next();
                }, 2100);
            }, 500);
        }, 3700);
    };

    const rockos_ship = () => {
        console.log('rocket ship');
        const overlay = document.getElementById('hack-overlay');
        overlay.classList.add('scary');
        const eventarea = document.getElementById('hack-event-container');
        delay(() => {
            eventarea.classList.add('show-scary');
        });
        TEXTBOX_LINE_MANAGER.queue({ msg: `it's always the same with you dogs.`, arrow: true, spell_out: true });
        TEXTBOX_LINE_MANAGER.queue({ msg: `rare drop this, rodin's brain that.`, arrow: true, spell_out: true });
        TEXTBOX_LINE_MANAGER.queue({ msg: `hours and hours of the same\nthing over and over again...`, arrow: true, spell_out: true, callback: () => {
            change_mob_sprite(SPRITES.rodin);
            set_mob_health(150, 150);
            document.getElementById('hack-player-row').classList.add('reveal');
            document.getElementById('hack-portrait').classList.add('reveal');
            document.getElementById('hack-button-section-2').classList.add('reveal');
            setTimeout(() => {
                play_sound(SOUNDS.appear, 0.2);
            }, 2370); 
        }});
        TEXTBOX_LINE_MANAGER.queue({ msg: `did you know it gets old only being seen\nas a resource for others to exploit?`, arrow: true, spell_out: true });
        TEXTBOX_LINE_MANAGER.queue({ msg: `maybe you need a reminder that other\ndogs have feelings besides you.`, arrow: true, spell_out: true });
        TEXTBOX_LINE_MANAGER.queue({ msg: `...but you probably don't care.`, arrow: true, spell_out: true });
        TEXTBOX_LINE_MANAGER.queue({ msg: `you'll just mindlessly click through this\nbecause you always get what you want.`, arrow: true, spell_out: true, callback: () => {
            [...document.getElementById('hack-button-section-2').querySelectorAll('button')].forEach(button => {
                button.classList.add('gone');
            })

            setTimeout(() => {
                play_sound(SOUNDS.whip, 0.1);
                setTimeout(() => {
                    play_sound(SOUNDS.whip, 0.1);
                }, 500);
            }, 2000);

            const rodin = document.getElementById('hack-mob-sprite').querySelector('img');
            rodin.classList.add('shake');
            setTimeout(() => {
                play_sound(SOUNDS.petrify, 0.2);
            }, 3350);
            setTimeout(() => {
                overlay.classList.add('semi-white');
                setTimeout(() => {
                    overlay.classList.remove('semi-white');
                    overlay.classList.add('white');
                    rodin.classList.remove('shake');
                    rodin.style.animation = "";
                    play_sound(SOUNDS.square, 0.35);
                    set_mob_health(999999, 150);
                    change_mob_sprite(SPRITES.rodin2);
                    document.getElementById('hack-hp-bar').querySelector('div.bar').style.width = "1000%";
                    setTimeout(() => {
                        overlay.classList.remove('white');
                        setTimeout(() => {
                            rodin_part_two();
                        }, 2250);
                    }, 100);
                }, 2000);
            }, 3450);
            setTimeout(() => {
                rodin.style.animation = 'horizontal-shaking-1 0.25s infinite';
                setTimeout(() => {
                    rodin.style.animation = 'horizontal-shaking-2 0.25s infinite';
                }, 250);
            }, 1500);
        }});
        TEXTBOX_LINE_MANAGER.queue({ msg: `isn't that right?`, arrow: false, spell_out: true });
        TEXTBOX_LINE_MANAGER.pick_next();
        play_sound(SOUNDS.swing, 0.3);
        setTimeout(() => {
            play_sound(SOUNDS.ohno, 0.06);
        }, 1700);
    }

    TEXTBOX_LINE_MANAGER.setup();
    TEXTBOX_LINE_MANAGER.queue({
        msg: 'Pup Cup hops out!',
        arrow: true,
        callback: () => {
            one_time_click(get_weapon(2), () => {
                TEXTBOX_LINE_MANAGER.queue({ msg: 'You used Rocko\'s Ship!', arrow: true, callback: rockos_ship });
                TEXTBOX_LINE_MANAGER.pick_next();
            })
        },
    });
    TEXTBOX_LINE_MANAGER.queue({ msg: 'What will you do?' });
    TEXTBOX_LINE_MANAGER.pick_next();

    return cleanup;
})();

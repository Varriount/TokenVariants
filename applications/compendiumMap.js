import { showArtSelect, doImageSearch, cacheTokens } from '../token-variants.mjs';
import { SEARCH_TYPE, updateActorImage, updateTokenImage } from '../scripts/utils.js';
import { addToQueue, renderFromQueue } from './artSelect.js';
import AlgorithmSettings from './algorithm.js';
import { TVA_CONFIG } from '../scripts/settings.js';

async function autoApply(actor, image1, image2, ignoreKeywords, formData) {
  let portraitFound = formData.ignorePortrait;
  let tokenFound = formData.ignoreToken;

  if (formData.diffImages) {
    let results = [];

    if (!formData.ignorePortrait) {
      results = await doImageSearch(actor.data.name, {
        searchType: SEARCH_TYPE.PORTRAIT,
        simpleResults: true,
        ignoreKeywords: ignoreKeywords,
        algorithmOptions: formData.algorithmSettings,
      });

      if ((results ?? []).length != 0) {
        portraitFound = true;
        await updateActorImage(actor, results[0], false, formData.compendium);
      }
    }

    if (!formData.ignoreToken) {
      results = await doImageSearch(actor.data.token.name, {
        searchType: SEARCH_TYPE.TOKEN,
        simpleResults: true,
        ignoreKeywords: ignoreKeywords,
        algorithmOptions: formData.algorithmSettings,
      });

      if ((results ?? []).length != 0) {
        tokenFound = true;
        updateTokenImage(results[0], { actor: actor, pack: formData.compendium });
      }
    }
  } else {
    let results = await doImageSearch(actor.data.name, {
      searchType: SEARCH_TYPE.BOTH,
      simpleResults: true,
      ignoreKeywords: ignoreKeywords,
      algorithmOptions: formData.algorithmSettings,
    });

    if ((results ?? []).length != 0) {
      portraitFound = tokenFound = true;
      updateTokenImage(results[0], {
        actor: actor,
        actorUpdate: { img: results[0] },
        pack: formData.compendium,
      });
    }
  }

  if (!(tokenFound && portraitFound) && formData.autoDisplayArtSelect) {
    addToArtSelectQueue(actor, image1, image2, ignoreKeywords, formData);
  }
}

function addToArtSelectQueue(actor, image1, image2, ignoreKeywords, formData) {
  if (formData.diffImages) {
    if (!formData.ignorePortrait && !formData.ignoreToken) {
      addToQueue(actor.data.name, {
        searchType: SEARCH_TYPE.PORTRAIT,
        object: actor,
        preventClose: true,
        image1: image1,
        image2: image2,
        ignoreKeywords: ignoreKeywords,
        algorithmOptions: formData.algorithmSettings,
        callback: async function (imgSrc, _) {
          await updateActorImage(actor, imgSrc);
          showArtSelect(actor.data.token.name, {
            searchType: SEARCH_TYPE.TOKEN,
            object: actor,
            force: true,
            image1: imgSrc,
            image2: image2,
            ignoreKeywords: ignoreKeywords,
            callback: (imgSrc, name) =>
              updateTokenImage(imgSrc, {
                actor: actor,
                imgName: name,
              }),
          });
        },
      });
    } else if (formData.ignorePortrait) {
      addToQueue(actor.data.name, {
        searchType: SEARCH_TYPE.TOKEN,
        object: actor,
        image1: image1,
        image2: image2,
        ignoreKeywords: ignoreKeywords,
        algorithmOptions: formData.algorithmSettings,
        callback: async function (imgSrc, name) {
          updateTokenImage(imgSrc, {
            actor: actor,
            imgName: name,
          });
        },
      });
    } else if (formData.ignoreToken) {
      addToQueue(actor.data.name, {
        searchType: SEARCH_TYPE.PORTRAIT,
        object: actor,
        image1: image1,
        image2: image2,
        ignoreKeywords: ignoreKeywords,
        algorithmOptions: formData.algorithmSettings,
        callback: async function (imgSrc, name) {
          await updateActorImage(actor, imgSrc);
        },
      });
    }
  } else {
    addToQueue(actor.data.name, {
      searchType: SEARCH_TYPE.BOTH,
      object: actor,
      image1: image1,
      image2: image2,
      ignoreKeywords: ignoreKeywords,
      algorithmOptions: formData.algorithmSettings,
      callback: async function (imgSrc, name) {
        await updateActorImage(actor, imgSrc);
        updateTokenImage(imgSrc, {
          actor: actor,
          imgName: name,
        });
      },
    });
  }
}

export default class CompendiumMapConfig extends FormApplication {
  constructor() {
    super({}, {});
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'token-variants-compendium-map-config',
      classes: ['sheet'],
      template: 'modules/token-variants/templates/compendiumMap.html',
      resizable: false,
      minimizable: false,
      title: game.i18n.localize('token-variants.settings.compendium-mapper.Name'),
      width: 500,
    });
  }

  async getData(options) {
    let data = super.getData(options);
    data = mergeObject(data, TVA_CONFIG.compendiumMapper);
    this.algorithmSettings = data.algorithmSettings
      ? data.algorithmSettings
      : deepClone(TVA_CONFIG.algorithm);

    const packs = [];
    game.packs.forEach((pack) => {
      if (pack.documentName === 'Actor' && !pack.locked) {
        packs.push({ title: pack.title, id: pack.collection });
      }
    });
    data.compendiums = packs;
    data.incKeywords = TVA_CONFIG.keywordSearch;

    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);
    html.find('.token-variants-auto-apply').change(this._onAutoApply);
    html.find('.token-variants-diff-images').change(this._onDiffImages);
    html.find(`.token-variants-algorithm`).on('click', this._onAlgorithmSettings.bind(this));
  }

  async _onAutoApply(event) {
    $(event.target)
      .closest('form')
      .find('.token-variants-auto-art-select')
      .prop('disabled', !event.target.checked);
  }

  async _onDiffImages(event) {
    $(event.target)
      .closest('form')
      .find('.token-variants-tp-ignore')
      .prop('disabled', !event.target.checked);
  }

  async _onAlgorithmSettings(event) {
    new AlgorithmSettings(this.algorithmSettings).render(true);
  }

  async startMapping(formData) {
    if (formData.diffImages && formData.ignoreToken && formData.ignorePortrait) {
      return;
    }

    if (formData.cache) {
      await cacheTokens();
    }

    const compendium = game.packs.get(formData.compendium);
    const ignoreKeywords = !formData.incKeywords;

    const processItem = async function (item) {
      const actor = await compendium.getDocument(item._id);

      let hasPortrait = actor.img !== CONST.DEFAULT_TOKEN;
      let hasToken = actor.data.token.img !== CONST.DEFAULT_TOKEN;
      if (formData.syncImages && hasPortrait !== hasToken) {
        if (hasPortrait) {
          await updateTokenImage(actor.img, { actor: actor });
        } else {
          await updateActorImage(actor, actor.data.token.img);
        }
        hasPortrait = hasToken = true;
      }

      let includeThisActor = !(formData.missingOnly && hasPortrait) && !formData.ignorePortrait;
      let includeThisToken = !(formData.missingOnly && hasToken) && !formData.ignoreToken;

      const image1 = formData.showImages ? actor.img : '';
      const image2 = formData.showImages ? actor.data.token.img : '';

      if (includeThisActor || includeThisToken) {
        if (formData.autoApply) {
          await autoApply(actor, image1, image2, ignoreKeywords, formData);
        } else {
          addToArtSelectQueue(actor, image1, image2, ignoreKeywords, formData);
        }
      }
    };

    const allItems = [];
    compendium.index.forEach((k) => {
      allItems.push(k);
    });

    if (formData.autoApply) {
      const starterPromise = Promise.resolve(null);
      allItems
        .reduce((p, item) => p.then(() => processItem(item)), starterPromise)
        .then(() => renderFromQueue());
    } else {
      const tasks = allItems.map(processItem);
      Promise.all(tasks).then(() => {
        renderFromQueue();
      });
    }
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    formData.algorithmSettings = this.algorithmSettings;
    game.settings.set('token-variants', 'compendiumMapper', formData);
    if (formData.compendium) {
      this.startMapping(formData);
    }
  }
}

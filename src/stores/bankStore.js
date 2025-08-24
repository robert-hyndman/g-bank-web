import { defineStore } from 'pinia';
import axios from 'axios';
import { ref } from 'vue';

import {
    collection,
    doc,
    getDoc,
    setDoc,
    deleteDoc,
    updateDoc,
    getDocs,
    query,
    where,
    serverTimestamp
} from 'firebase/firestore';

import { db } from '@/firebase';

export const bankStore = defineStore('bankStore', {
    state: () => ({
        inventory: ref([]),
        inventories: {},
        characters: {},
        totalMoney: 0,
        storedItems: JSON.parse(localStorage.getItem('storedItems')) || {},
        allowedCharacters:ref([]),
        reservedItems: ref([])
    }),

    actions: {
        async init() {
            console.log('Initializing bankStore...');

            console.log('Fetching allowed characters...');
            await this.fetchAllowedCharacters();

            console.log('Fetching reserved items...');
            await this.fetchReservedItems();

            console.log('Initialized bankStore');
        },

        async parseData(lua, username) {
            lua = this.prettifyLua(lua)
            this.inventory.value = []
            this.inventories = {};
            this.totalMoney = 0;

            const lines = lua.split('\n');
            let isValidCharacter = false;
            let isInEquipSection = false;
            let currentCharacter = {
                name: null,
                race: null,
                class: null,
                level: null,
            };

            let output = {};

            lines.forEach((line, index) => {
                line = line.replace(/\r$/, '');
                const characterMatch = line.match(/^\s{8}\["([\p{L}]+)"\] = \{$/u);

                if (characterMatch) {
                    currentCharacter.name = characterMatch[1];
                    isValidCharacter = this.allowedCharacters.includes(currentCharacter.name.toLowerCase());
                    isInEquipSection = false; // Reset equip section tracking
                }

                // Track when we enter/exit equip sections
                if (line.includes('["equip"]')) {
                    isInEquipSection = true;
                }
                if (isInEquipSection && line.includes('},')) {
                    isInEquipSection = false;
                }

                if (isValidCharacter && !this.inventories[currentCharacter.name]) {
                    this.inventories[currentCharacter.name] = { items: {}, money: 0 };
                }

                if (isValidCharacter && !isInEquipSection) {
                    output.name = currentCharacter.name;
                    
                    if (line.includes('race')) {
                        const raceMatch = line.match(/\["race"\]\s*=\s*"([^"]+)",/);
                        output.race = raceMatch[1];
                    }

                    if (line.includes('class')) {
                        const classMatch = line.match(/\["class"\]\s*=\s*"([^"]+)",/);
                        output.class = classMatch[1];
                    }

                    if (line.includes('level')) {
                        const levelMatch = line.match(/\["level"\]\s*=\s*(\d+),/);
                        output.level = levelMatch[1];
                    }

                    // Handle both array format [6] = "item" and direct format "item"
                    const arrayItemMatch = line.match(/\[\d+\]\s*=\s*"(\d+):{8}\d+:{9};*(\d*)"/);
                    const directItemMatch = !line.includes('[') ? line.match(/(\d+):{8}\d+:{9};*(\d*)/) : null;
                    
                    const itemMatch = arrayItemMatch || directItemMatch;
                    
                    if (itemMatch) {
                        const itemId = arrayItemMatch ? itemMatch[1] : itemMatch[1];
                        const countStr = arrayItemMatch ? itemMatch[2] : itemMatch[2];

                        if (itemId != 6948) { // exclude hearthstone
                            const count = parseInt(countStr || '1', 10);
                            const currentCount = this.inventories[currentCharacter.name].items[itemId] || 0;

                            this.inventories[currentCharacter.name].items[itemId] = currentCount + count;

                            console.log(`Parsed item: ${itemId}, count: ${count}, total: ${currentCount + count}`);

                            this.scrapeItem(itemId).catch(err => {
                                console.warn(`scrapeItem failed for ${itemId}`, err);
                            });
                        }
                    }

                    if (line.includes('money')) {
                        const moneyMatch = line.match(/(\d+)/);
                        if (moneyMatch) {
                            const money = parseInt(moneyMatch[1], 10);
                            this.inventories[currentCharacter.name].money += money;
                        }
                    }
                }
            });

            this.totalMoney = Object.values(this.inventories).reduce((sum, inv) => sum + inv.money, 0);

            try {
                await this.saveParsedItems();
                await this.saveMoney();
                await this.updateLastUpdatedTime(username);
            } catch (err) {
                console.error('Error during save/update phase of parseData:', err);
            }
        },

        prettifyLua(lua) {
            const lines = lua.split('\n');
            let indentLevel = 0;
            const indentSize = 4;

            return lines
                .map(line => {
                    line = line.trim();

                    if (line.endsWith('},') || line === '},' || line === '}') {
                        indentLevel = Math.max(0, indentLevel - 1);
                    }

                    const indentedLine = ' '.repeat(indentLevel * indentSize) + line;

                    if (line.endsWith('{')) {
                        indentLevel++;
                    }

                    return indentedLine;
                })
                .join('\n');
        },

        async scrapeItem(itemId) {
            try {
                const snapshot = await getDocs(
                    query(collection(db, 'scraped_items'), where('item_id', '==', itemId))
                );

                if (!snapshot.empty) {
                    return snapshot.docs[0].data();
                }

                const response = await axios.get(
                    'https://us-central1-ah-gbank.cloudfunctions.net/getWowheadItem', {
                    params: { itemId }
                }
                );

                const item = {
                    item_id: itemId,
                    name: response.data.name,
                    quality: this.itemQuality(response.data.quality),
                    icon: await this.getIconData(response.data.icon),
                    url: response.data.url
                };

                await this.insertScrapedItem(item);

                return item;

            } catch (error) {
                console.warn(`Failed to scrape or load item ${itemId}`, error);
                return {
                    item_id: itemId,
                    name: `Unknown Item (${itemId})`,
                    quality: 1,
                    icon: '',
                    url: '#'
                };
            }
        },

        itemQuality(qualityName) {
            const map = {
                Poor: 0,
                Common: 1,
                Uncommon: 2,
                Rare: 3,
                Epic: 4,
                Legendary: 5
            };

            return map[qualityName] ?? 1;
        },

        async getIconData(icon) {
            let iconData = await axios.get(`https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg`, { responseType: 'arraybuffer' });
            return `data:image/jpeg;base64,${window.btoa(String.fromCharCode(...new Uint8Array(iconData.data)))}`;
        },

        // Firebase: save parsed inventory items
        async saveParsedItems() {
            const inventoryRef = collection(db, 'inventory');

            try {
                // Step 1: Delete existing inventory
                const snapshot = await getDocs(inventoryRef);
                const deletePromises = snapshot.docs.map(doc => {
                    return deleteDoc(doc.ref);
                });
                await Promise.all(deletePromises);

                // Step 2: Save parsed items
                let saveCount = 0;
                for (const [character, data] of Object.entries(this.inventories)) {
                    for (const [itemId, count] of Object.entries(data.items)) {
                        const docId = `${character}_${itemId}`;
                        const itemRef = doc(db, 'inventory', docId);
                        const itemData = {
                            character,
                            item_id: Number(itemId),
                            count
                        };

                        try {
                            await setDoc(itemRef, itemData);
                            saveCount++;
                        } catch (itemError) {
                            console.warn(`❌ Failed to save ${docId}:`, itemError);
                        }
                    }
                }
            } catch (err) {
                console.error('❌ Error in saveParsedItems:', err);
            }
        },

        // Firebase: save money
        async saveMoney() {
            const moneyRef = doc(db, 'money', 'total');
            const total = this.totalMoney;

            const gold = Math.floor(total / 10000);
            const silver = Math.floor((total % 10000) / 100);
            const copper = total % 100;

            await setDoc(moneyRef, {
                gold,
                silver,
                copper
            }, { merge: true });
        },

        // Firestore: get scraped item by id
        async getScrapedItemById(id) {
            const docRef = doc(db, 'scraped_items', String(id));
            const snapshot = await getDoc(docRef);

            if (snapshot.exists()) {
                return snapshot.data();
            } else {
                return null;
            }
        },

        // Firestore: get scraped items by ids (batched)
        async getScrapedItemsByIds(ids) {
            const chunks = [];
            const results = [];

            // Break IDs into chunks of 10
            for (let i = 0; i < ids.length; i += 10) {
                chunks.push(ids.slice(i, i + 10));
            }

            for (const chunk of chunks) {
                const q = query(
                    collection(db, 'scraped_items'),
                    where('item_id', 'in', chunk)
                );
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => results.push(doc.data()));
            }

            return results;
        },

        // Firestore: get all inventory items
        async getAllInventoryItems() {
            try {
                const snapshot = await getDocs(collection(db, 'inventory'));
                this.inventory.value = snapshot.docs.map(doc => ({
                    ...doc.data()
                }));
            } catch (error) {
                console.error('Failed to load inventory:', error);
            }
        },

        // Firestore: insert scraped item
        async insertScrapedItem(item) {
            try {
                const itemRef = doc(db, 'scraped_items', String(item.item_id));
                await setDoc(itemRef, item, { merge: true });
            } catch (error) {
                console.error('Error inserting scraped item:', error);
            }
        },

        // Firestore: upsert scraped item
        async upsertScrapedItem(item) {
            const snapshot = await getDocs(
                query(collection(db, 'scraped_items'), where('item_id', '==', item.item_id))
            );

            if (!snapshot.empty) {
                await updateDoc(doc(db, 'scraped_items', snapshot.docs[0].id), {
                    ...item
                });
            } else {
                await addDoc(collection(db, 'scraped_items'), {
                    ...item
                });
            }
        },

        // Firestore: update the last updated at time
        async updateLastUpdatedTime(username) {
            const snapshot = await getDocs(collection(db, 'updated_at'));

            await updateDoc(doc(db, 'updated_at', snapshot.docs[0].id), {
                username,
                timestamp: serverTimestamp()
            });
        },

        // Firestore: get the last updated at time
        async getLastUpdatedTime() {
            const snapshot = await getDocs(collection(db, 'updated_at'))
            const data = snapshot.docs[0].data();
            const date = data.timestamp.toDate();

            return {
                username: data.username,
                timestamp: `${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`
            };
        },

        async bankGold() {
            const docRef = doc(db, 'money', 'total');
            const snapshot = await getDoc(docRef);

            if (snapshot.exists()) {
                const data = snapshot.data();
                return {
                    gold: data.gold ?? 0,
                    silver: data.silver ?? 0,
                    copper: data.copper ?? 0
                };
            } else {
                console.warn('💸 No bank gold found in Firestore.');
                return { gold: 0, silver: 0, copper: 0 };
            }
        },

        // Firestore: check if an item is reserved
        isItemReserved(itemId) {
            return this.reservedItems.value.includes(Number(itemId)) || 
                   this.reservedItems.value.includes(String(itemId));
        },

        // Firestore: fetch allowed characters
        async fetchAllowedCharacters() {
            try {
                const snapshot = await getDocs(collection(db, 'characters'));
                this.allowedCharacters = snapshot.docs.map(doc => {
                    const name = doc.data().name;
                    const nameStr = typeof name === 'string' ? name : String(name);
                    return nameStr.toLowerCase();
                });
                console.log('Fetched allowed characters:', this.allowedCharacters);
            } catch (error) {
                console.error('Failed to load allowed characters:', error);
            }
        },

        // Firestore: fetch all reserved items
        async fetchReservedItems() {
            try {
                const snapshot = await getDocs(collection(db, 'reserved_items'));
                this.reservedItems.value = snapshot.docs.map(doc => {
                    // Handle both string and number formats
                    const id = doc.data().item_id;
                    return typeof id === 'string' ? id : String(id);
                });
                console.log('Fetched reserved items:', this.reservedItems);
            } catch (error) {
                console.error('Failed to load reserved items:', error);
            }
        }
    }
});

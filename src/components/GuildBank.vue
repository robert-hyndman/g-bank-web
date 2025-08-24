<template>
    <v-container>
        <v-card class="wow-tooltip-transparent" flat>
            <template v-slot:text>
                <v-file-input v-if="auth.isLoggedIn" ref="fileInput" label="Upload .lua File"
                    prepend-icon="mdi-file-upload-outline" @change="handleFileUpload" />
                <v-row>
                    <v-col cols="6">
                        <v-text-field v-model="filter" label="Filter" prepend-inner-icon="mdi-magnify"
                            variant="outlined" hide-details single-line density="comfortable"></v-text-field>
                    </v-col>
                    <v-col cols="6" class="d-flex justify-end align-center">
                        <div class="d-flex justify-end align-center">
                            <span class="mr-1 shimmer-update" :key="shimmerKey">{{ bankGold.gold }}</span>
                            <img class="mr-1" src="/money-gold.gif" alt="gold">
                            <span class="mr-1 shimmer-update" :key="'s' + shimmerKey">{{ bankGold.silver }}</span>
                            <img class="mr-1" src="/money-silver.gif" alt="silver">
                            <span class="mr-1 shimmer-update" :key="'c' + shimmerKey">{{ bankGold.copper }}</span>
                            <img class="mr-1" src="/money-copper.gif" alt="copper">
                        </div>
                    </v-col>
                </v-row>
            </template>
            <v-card-text>
                <v-data-table :key="tableKey" class="transparent" :items="filteredItems" :loading="isLoading"
                    :items-per-page="itemsPerPage" density="compact" :sort-by="sortBy" :sort-desc="sortDesc"
                    @update:sort-by="updateSortBy" @update:sort-desc="updateSortDesc" @update:items-per-page="updateItemsPerPage"
                    :headers="headers">
                    <template v-slot:loading>
                        <div class="shimmer-spinner-wrapper">
                            <v-progress-circular indeterminate size="48" width="4" color="#f4a261"
                                class="shimmer-spinner" />
                        </div>
                    </template>
                    <template v-slot:item="{ item, index }">
                        <tr @mouseover="hoveredRow = index" @mouseleave="hoveredRow = null"
                            :class="{ 
                                'hovered-row': hoveredRow === index,
                                'reserved-row': item.reserved 
                            }">
                            <td :style="{ display: 'flex', alignItems: 'center' }">
                                <a :href="item.url" :style="{
                                    color: getItemQualityColor(item.quality),
                                    textDecoration: 'none',
                                    display: 'flex',
                                    alignItems: 'center'
                                }" class="ml-2" target="_blank">
                                    <div style="position: relative; width: 20px; height: 20px; margin-right: 5px;">
                                        <img :src="item.icon" width="19" height="19" crossorigin="anonymous"
                                            style="display: block;" />
                                        <img src="https://wow.zamimg.com/images/Icon/large/border/default.png"
                                            width="22" height="22" style="position: absolute; top: -1px; left: -1px;"
                                            crossorigin="anonymous" />
                                    </div>
                                    {{ item.name }}
                                </a>
                            </td>
                            <td>{{ item.count }}</td>
                            <td>{{ item.character }}</td>
                            <td class="text-center">
                                <v-icon
                                    v-if="item.reserved"
                                    class="shimmer-update"
                                    :key="'lock-' + item.item_id + '-' + tableKey"
                                    color="rgba(244, 162, 97, 1)"
                                    size="small"
                                >
                                    mdi-lock
                                </v-icon>
                            </td>
                        </tr>
                    </template>
                </v-data-table>
                <div class="d-flex justify-end align-center text-caption text-disabled mt-2">Updated by {{
                    updatedAt?.username || ''
                    }}, {{ updatedAt?.timestamp || '' }}</div>
            </v-card-text>
        </v-card>
    </v-container>
</template>

<script setup>
import { ref, computed, onMounted, watchEffect, watch } from 'vue';
import { bankStore } from '@/stores/bankStore';
import { authStore } from '@/stores/authStore';
import { useDisplay } from 'vuetify';

const bs = bankStore();
const auth = authStore();
const { mobile } = useDisplay();

const fileInput = ref(null);
const isLoading = ref(true);
const filter = ref("");
const inventoryItems = ref([]);
const itemsPerPage = ref(parseInt(localStorage.getItem('guildBankItemsPerPage') || '10'));

// Watch for changes in itemsPerPage and save to localStorage
watch(itemsPerPage, (newValue) => {
    localStorage.setItem('guildBankItemsPerPage', newValue.toString());
});

watchEffect(async () => {
    if (!bs.inventory?.value?.length) {
        return;
    }

    inventoryItems.value.length = 0;
    const ids = bs.inventory.value.map(i => i.item_id);
    const snapshots = await Promise.all(ids.map(id => bs.getScrapedItemById(id)));

    bs.inventory.value.forEach((item, index) => {
        const scrapedItem = snapshots[index];
        const safeScrapedItem = scrapedItem && typeof scrapedItem === 'object'
            ? scrapedItem
            : {
                name: `Unknown (${item.item_id})`,
                icon: '',
                url: '#',
                quality: 1
            };

        inventoryItems.value.push({
            ...safeScrapedItem,
            count: item.count,
            character: item.character
        });
    });
})
const tableKey = ref(0);
const shimmerKey = ref(0);
const bankGold = ref({
    gold: 0,
    silver: 0,
    copper: 0
});
const updatedAt = ref(null);
const hoveredRow = ref(null);
const sortBy = ref(['name']);
const sortDesc = ref(false);

const headers = ref([
    { title: 'Item', align: 'start', key: 'name', sortable: true },
    { title: 'Count', key: 'count', sortable: true },
    { title: 'Character', key: 'character', sortable: true },
    { title: 'Reserved', key: 'reserved', sortable: true, align: 'center' },
]);

onMounted(async () => {
    isLoading.value = true;
    await bs.init();
    await bs.getAllInventoryItems();
    await fetchGold();
    await fetchUpdatedAt();
    tableKey.value++;
    isLoading.value = false;
});

const handleFileUpload = async (event) => {
    isLoading.value = true;
    const file = event.target.files[0];
    if (!file) {
        isLoading.value = false;
        return;
    }
    let text = await file.text();

    await bs.fetchAllowedCharacters();
    await bs.fetchReservedItems();
    await bs.parseData(text, auth.username);
    // await fetchInventoryItems();
    await fetchGold();
    await fetchUpdatedAt();
    tableKey.value++;
    isLoading.value = false;
};

// const fetchInventoryItems = async () => {
//     inventoryItems.value.length = 0;

//     const ids = bs.inventory.map(i => i.item_id);
//     const snapshots = await Promise.all(ids.map(id => bs.getScrapedItemById(id)));

//     bs.inventory.forEach((item, index) => {
//         const scrapedItem = snapshots[index];

//         const safeScrapedItem = scrapedItem && typeof scrapedItem === 'object'
//             ? scrapedItem
//             : {
//                 name: `Unknown (${item.item_id})`,
//                 icon: '',
//                 url: '#',
//                 quality: 1
//             };

//         inventoryItems.value.push({
//             ...safeScrapedItem,
//             count: item.count,
//             character: item.character
//         });
//     });
// };

const fetchGold = async () => {
    const gold = await bs.bankGold();
    bankGold.value = gold;
    shimmerKey.value++;
};

const fetchUpdatedAt = async () => {
    updatedAt.value = await bs.getLastUpdatedTime();
}

const filteredItems = computed(() => {
    if (!filter.value) return inventoryItems.value.map(item => ({
        ...item,
        reserved: Boolean(bs.isItemReserved(item.item_id))
    }));
    
    return inventoryItems.value.filter(item => {
        return (
            item.name.toLowerCase().includes(filter.value.toLowerCase()) ||
            String(item.item_id).toLowerCase().includes(filter.value.toLowerCase()) ||
            item.character.toLowerCase().includes(filter.value.toLowerCase())
        );
    }).map(item => ({
        ...item,
        reserved: Boolean(bs.isItemReserved(item.item_id))
    }));
});

const getItemQualityColor = (quality) => {
    const qualityColors = {
        0: '#9d9d9d',
        1: '#ffffff',
        2: '#1eff00',
        3: '#0070dd',
        4: '#a335ee',
        5: '#ff8000',
        6: '#e6cc80',
    };
    return qualityColors[quality] || '#ffffff';
};

const updateSortBy = (val) => {
    sortBy.value = val;
};

const updateSortDesc = (val) => {
    sortDesc.value = val;
};

const updateItemsPerPage = (val) => {
    itemsPerPage.value = val;
};
</script>

<style scoped>
.hovered-row {
    background-color: rgba(244, 162, 97, 0.1);
    cursor: pointer;
}

.reserved-row {
    background-color: rgba(180, 60, 60, 0.2);
}

.reserved-row.hovered-row {
    background-color: rgba(244, 162, 97, 0.1);
}

.transparent {
    background-color: rgba(0, 0, 0, 0);
}

:deep(.v-data-table-header__content) {
    font-family: 'FrizQuadrata', sans-serif;
    font-size: 16px;
    color: rgba(244, 162, 97, 1);
}

@keyframes shimmer {
    0% {
        opacity: 0.5;
        transform: scale(1);
    }

    50% {
        opacity: 1;
        transform: scale(1.1);
    }

    100% {
        opacity: 0.5;
        transform: scale(1);
    }
}

.shimmer-update {
    animation: shimmer 0.8s ease-in-out;
}

.shimmer-spinner-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 32px 0;
    position: relative;
}

.shimmer-spinner {
    animation: pulse-glow 1.5s ease-in-out infinite;
}

.sparkle {
    position: absolute;
    top: -8px;
    left: -8px;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(244, 162, 97, 0.3) 0%, transparent 70%);
    animation: sparkle-fade 1.5s ease-in-out infinite;
    pointer-events: none;
    z-index: -1;
}

@keyframes pulse-glow {
    0% {
        transform: scale(1);
        filter: drop-shadow(0 0 4px rgba(244, 162, 97, 0.4));
    }

    50% {
        transform: scale(1.1);
        filter: drop-shadow(0 0 12px rgba(244, 162, 97, 0.8));
    }

    100% {
        transform: scale(1);
        filter: drop-shadow(0 0 4px rgba(244, 162, 97, 0.4));
    }
}

@keyframes sparkle-fade {

    0%,
    100% {
        opacity: 0.2;
        transform: scale(0.95);
    }

    50% {
        opacity: 0.6;
        transform: scale(1.1);
    }
}
</style>

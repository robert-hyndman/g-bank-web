/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// const {onRequest} = require("firebase-functions/v2/https");
// const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

import { https } from 'firebase-functions';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

export const getWowheadItem = https.onRequest(async (req, res) => {
  const itemId = req.query.itemId;

  if (!itemId) {
    res.status(400).send('Missing itemId');
    return;
  }

  try {
    const response = await axios.get(
      `https://classic.wowhead.com/item=${itemId}&xml`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/xml',
        }
      }
    );

    const parser = new XMLParser();
    const json = parser.parse(response.data);

    const item = json.wowhead?.item;

    if (!item) {
      res.status(404).send('Item not found');
      return;
    }

    const result = {
      item_id: itemId,
      name: item.name,
      quality: item.quality,
      icon: item.icon,
      url: `https://www.wowhead.com/classic/item=${itemId}`
    };

    res.set('Access-Control-Allow-Origin', '*');
    res.status(200).json(result);
  } catch (error) {
    console.error('Failed to fetch Wowhead XML:', {
      itemId,
      message: error.message,
      status: error.response?.status,
      text: error.response?.data?.toString().slice(0, 200)
    });
    res.status(500).send('Error fetching Wowhead data');
  }
});

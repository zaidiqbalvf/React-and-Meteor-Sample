
// ____________________________________________________________________ Packages
import { check } from 'meteor/check';
import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/alanning:roles';
import { _, find, extend, has } from 'lodash';

// ___________________________________________________________________ Libraries
import Collections, { Inventories, Companies } from '/lib/collections';
import { PremierAg } from '/lib/PremierAg';

const now = new Date().valueOf();

const sinceNumOfDays = (numOfDays) => {
  return new Date(now - numOfDays * 24 * 60 * 60 * 1000);
};

const viewPermissions = [
  'admin',
  'manager',
  'member',
  'inventory',
  'salesMgr',
  'sales',
];
//
// These are the 'global' Roles that CAN view Global Inventories.
const viewAllPermissions = [
  'superadmin'
];


if (Meteor.isServer) {
  // ________________________________________________________ MAIN MAP/LIST VIEW
  Meteor.publish('inventoriesMain', function (ownerId, { viewGlobal }) {
    check(ownerId, Match.Maybe(String)); // 'ownerId' === 'groupId'
    // check(viewGlobal, Boolean);
    console.log('checked');
    if (!this.userId) { return this.ready(); }

    const subscription = this;
    const canView = Roles.userIsInRole(this.userId, viewPermissions, ownerId);
    const canViewAll = Roles.userIsInRole(this.userId, viewAllPermissions);
    let query;

    if (canViewAll && viewGlobal) { query = {}; } else if (canView) {
      query = { ownerId };
    } else { return this.ready(); }

    const handle = Inventories.find(query, {
      fields: {
        ownerId: 1,
        createdAt: 1,
        location: 1,
        name: 1,
        description: 1,
        type: 1,
        product: 1,
        samples: 1,
        stack: 1,
        bale: 1,
        isThirdParty: 1,
        childInventory: 1,
        season: 1,
        harvest:1,
      },
    }).observe({
      added(inventory) {
        const doc = inventory;
        const { _id, samples } = inventory;

        const v = Collections.Verified.findOne({ inventoryId: _id });

        if (v) {
          doc.verified = {
            id: v._id,
            number: v.number,
            ...v.specification,
          };
        }

        const c = Companies.findOne(inventory.ownerId);

        if (c && c.name) { doc.owner = c.name; }

        const r = Collections.Reports.find({ sampleId: { $in: samples } }).fetch();

        const chem = find(r, { type: 'chem' });
        const nir = find(r, { type: 'nir' });
        const pcr = find(r, { type: 'pcr' });
        const vw = find(r, { type: 'vw' });
        const sls = find(r, { type: 'sls' });
        const nirPremier = find(r, { type: 'nirPremier' });

        if (chem) {
          const { adf, ndf, cp, K19 } = chem;
          if (cp) { doc.protein = cp; }
          if (K19) { doc.k19 = K19; }
          extend(doc, PremierAg.calculate(adf, ndf, cp));
          extend(doc, { chem: 'detected' });
          // if (doc.rfv > 500) { console.log('CHEM:', chem._id, `adf=${adf} ndf=${ndf} cp=${ndf} => RFV:${doc.rfv} > 500`); }
        }

        if (nir) {
          const { adf, ndf, cp, K19 } = nir;
          if (cp) { doc.protein = cp; }
          if (K19) { doc.k19 = K19; }
          extend(doc, PremierAg.calculate(adf, ndf, cp));
          extend(doc, { nir: 'detected' });
          // if (doc.rfv > 500) { console.log('NIR:', nir._id, `adf=${adf} ndf=${ndf} cp=${ndf} => RFV:${doc.rfv} > 500`); }
        }

        if (pcr && has(pcr, 'detected')) {
          doc.pcr = pcr.detected ? 'detected' : 'not-detected';
        }

        if (vw && has(vw, 'detected')) {
          doc.vw = vw.detected ? 'detected' : 'not-detected';
        }

        if (sls) {
          doc.sls = 'detected';
        }

        if (nirPremier) {
          doc.nirPremier = 'detected';
        }

        subscription.added('inventories', _id, doc);
      },
      removed({ _id }) { subscription.removed('inventories', _id); },
    });

    this.onStop(() => handle.stop());

    return this.ready();
  });


  // _______________________________________________________________ DETAIL VIEW
  Meteor.publish('inventoryDetail', function (inventoryId) {
    // Check arguments
    check(inventoryId, String);

    if (!this.userId) { return this.ready(); }

    const inventory = Inventories.findOne(inventoryId);
    let query = {};
    query = JSON.stringify({ $or: [{ _id: inventoryId }, { originId: inventoryId }] });
    if (inventory.childInventory) {
      query = JSON.stringify({ $or: [{ _id: inventoryId }, { originId: inventoryId }, { _id: { $in: inventory.childInventory } }] });
    }
    inventories = Inventories.find(JSON.parse(query), {
      fields: {
        migration: 0,
      },
    });

    return [
      // Inventories cursor
      inventories
      ,

      // Companies cursor with only the 'requestedFor' company, limited to
      // only their contact info.
      Collections.Companies.find(inventory.ownerId, {
        fields: { name: 1, address: 1, phone: 1, website: 1 },
      }),

      // Any associated Samples from that inventory object.
      Collections.Samples.find({
        _id: { $in: inventory.samples },
      }, {
          fields: { migration: 0 },
          sort: {
            sampledAt: -1,
            requestedAt: -1,
          },
        }),

      // Cursor with any Verified Reports from the inventory's sample sets.
      Collections.Verified.find({
        samples: { $in: inventory.samples },
      }, {
          fields: { migration: 0 },
        }),

      // Any associated Lab Reports for the inventory's sample set..
      Collections.Reports.find({
        sampleId: { $in: inventory.samples },
      }, {
          fields: { migration: 0 },
        }),

      // Any associated Activities.
      Collections.Activity.find({
        collection: 'inventories',
        document: inventoryId,
        triggeredAt: { $gt: sinceNumOfDays(90) },
      }, {
          fields: {
            triggeredAt: 1,
            // preface: 1,
            subject: 1,
            yodaize: 1,
            message: 1,
            context: 1,
            adjunct: 1,
          },
          sort: { triggeredAt: -1 },
          limit: 120,
        }),
    ];
  });
}

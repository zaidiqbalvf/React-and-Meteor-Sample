
// ____________________________________________________________________ Packages
import { check } from 'meteor/check';
import { Meteor } from 'meteor/meteor';
import { _ } from 'lodash';

// ___________________________________________________________________ Libraries
import Collections, { Inventories, Verified, Companies, Documents } from '/lib/collections';
import pretty from '/lib/pretty';
import { PremierAg } from '/lib/PremierAg';

function saveTicket(reqObj) {
	let { inventoryId, submission } = reqObj;
	const inventory = Inventories.findOne(inventoryId);
	if (!inventoryId || !inventory) {
		throw new Meteor.Error('Invalid Request',
			'That Inventory could not be found.');
	}

	const documentId = Documents.insert({
		uploadedAt: new Date(),
		uploadedBy: this.userId,
		inventoryId,
		directive: 'inventoryTicket',
		original: submission.scaleTicket[0],
	});
	const document = Documents.findOne(documentId);
	let DocumentOnSmapleSchema = {
		id: document._id, url: document.original.url, key: document.original.key, filename: document.original.filename,
		baleCount: submission.bale.count, stack_storage: submission.stack.storage, stack_config: submission.stack.config, moved_tons: parseInt(submission.moved_tons)
	};

	Inventories.update(inventoryId, { $addToSet: { scaleTicket: DocumentOnSmapleSchema } }, {
		selector: { type: inventory.type }
	});

	return DocumentOnSmapleSchema;
}

Meteor.methods({
	// ____________________________________________________________ REQUEST/CREATE
	'inventory.create'(submission, verify, parentId) {
		// Check arguments
		check(submission, Object);
		check(verify, Boolean);

		const inventoryObj = _.clone(submission);
		let message = "";
		const company = Collections.Companies.findOne(submission.ownerId);

		if (!company) {
			throw new Meteor.Error('No Company Found.',
				"Couldn't locate that company to allocate that inventory with."
			);
		}

		if (!submission.samples || !_.isArray(submission.samples)) {
			inventoryObj.samples = [];
		}

		delete inventoryObj.scaleTicket;
		const inventoryId = Inventories.insert(inventoryObj);
		if (submission.scaleTicket && submission.scaleTicket[0]) {
			saveTicket({ inventoryId: inventoryId, file: submission.scaleTicket, submission: submission });
		}
		if (parentId) {
			try {
				const parent_inventory = Inventories.findOne(parentId);
				let parentSubmission = {
					bale: {
						count: parent_inventory.bale.count - inventoryObj.bale.count
					}
				};
				let bale_count = parent_inventory.bale.count - inventoryObj.bale.count;
				Inventories.update(parent_inventory._id, {
					$addToSet: { childInventory: inventoryId },
					$set: {
						"bale.count": bale_count,
						"stack.tons": PremierAg.define().inventory.tonnage(parent_inventory.product, parent_inventory.bale.size, bale_count)
					}
				}, {
						selector: { type: parent_inventory.type },
					});
				message = 'Inventory Moved!';
			} catch (ex) {
				console.log(ex);
			}
		}
		else {
			message = 'New Inventory Added!';
			if (verify) {
				Meteor.call('verified.request', inventoryId);
				message = "You're Verified report is on it's way!";
			}
		}
		return { id: inventoryId, message };
	},


	// ______________________________________________________________________ EDIT
	'inventory.trash'(obj) {
		// Check arguments
		check(obj, Object);
		let { inventoryId } = obj;
		const inventory = Inventories.findOne(inventoryId);

		// Update the inventory document.
		Inventories.remove(inventory._id);

		return { message: 'Inventory trashed.' };
	},

	'inventory.edit'(inventoryId, submission) {
		// Check arguments
		check(inventoryId, String);
		check(submission, Object);

		const inventory = Inventories.findOne(inventoryId);

		// Update the inventory document.
		Inventories.update(inventoryId, { $set: { 'season': submission.season, 'bale.count': submission.bale.count, 'stack.tons': parseInt(submission.stack.tons) } }, {
			selector: { type: inventory.type },
		});

		return { id: inventoryId, message: 'Changes saved.' };
	},

	'inventory.edit.move'(inventoryId, submission, ParentId) {
		// Check arguments
		check(inventoryId, String);
		check(submission, Object);
		const inventory = Inventories.findOne(inventoryId);

		let query = { $set: { 'stack.storage': submission.stack.storage, 'stack.config': submission.stack.config, 'bale.count': inventory.bale.count + parseInt(submission.bale.count), 'stack.tons': submission.stack.tons } };
		if (submission.scaleTicket && submission.scaleTicket[0]) {
			saveTicket({ inventoryId: inventoryId, file: submission.scaleTicket, submission: submission });
		}

		try {
			const parent_inventory = Inventories.findOne(ParentId);
			let bale_count = parent_inventory.bale.count - submission.bale.count;
			// Update the Parent inventory document.
			Inventories.update(parent_inventory._id, {
				$set: {
					"bale.count": bale_count,
					"stack.tons": PremierAg.define().inventory.tonnage(parent_inventory.product, parent_inventory.bale.size, bale_count)
				}
			}, {
					selector: { type: parent_inventory.type },
				});

			// Update the child inventory document.
			Inventories.update(inventoryId, query, {
				selector: { type: inventory.type },
			});
		} catch (ex) {
			console.log(ex);
		}

		return { id: inventoryId, message: 'Inventory Moved!' };
	},


	// __________________________________________________________________ FAVORITE
	'inventory.favorite'(inventoryId) {
		// Check arguments
		check(inventoryId, String);
		this.unblock();

		const user = Meteor.user();
		const inventory = Inventories.findOne(inventoryId);
		const company = Companies.findOne(inventory.ownerId);
		let operator = {};
		let options = { multi: true };

		if (_.find(user.favorites, (fav) => fav.param === inventoryId)) {
			options = _.extend(options, { bypassCollection2: true });
			operator = {
				$pull: { favorites: { param: inventoryId } },
			};
		} else {
			operator = {
				$addToSet: {
					favorites: {
						path: '/inventory',
						text: `${pretty.type(inventory.type)} Inventory ${inventory.name}`,
						icon: 'icon ion-cube',
						param: inventoryId,
						favoriteType: 'Inventory',
						number: inventory.name,
						// sharedBy: verified.sharedWith,
						company: company.name,
						favoriteId: inventory.name
					},
				},
			};
		}

		Meteor.users.update(user._id, operator, options);
	},

	'inventory.uploadTicket'(reqObj) {
		let { inventoryId, file } = reqObj;
		const inventory = Inventories.findOne(inventoryId);

		if (!inventoryId || !inventory) {
			throw new Meteor.Error('Invalid Request',
				'That Inventory could not be found.');
		}

		const documentId = Documents.insert({
			uploadedAt: new Date(),
			uploadedBy: this.userId,
			inventoryId,
			directive: 'inventoryTicket',
			original: file,
		});
		const document = Documents.findOne(documentId);
		let DocumentOnSmapleSchema = { id: document._id, url: document.original.url, key: document.original.key };

		Inventories.update(inventoryId, { $set: { scaleTicket: DocumentOnSmapleSchema } });

		return DocumentOnSmapleSchema;
	},
});

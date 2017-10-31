
// ____________________________________________________________________ Packages
import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { findDOMNode } from 'react-dom';
import { Link } from 'react-router';
import { analytics } from 'meteor/okgrow:analytics';
import { createContainer } from 'meteor/react-meteor-data';
import { _ } from 'lodash';
import Helmet from 'react-helmet';
import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/alanning:roles';

// ___________________________________________________________________ Libraries
import { PremierAg } from '/lib/PremierAg';
import { Inventories } from '/lib/collections/index.js';
import pretty from '/lib/pretty';
import * as actions from '/imports/startup/client/actions/inventories';
import * as groupactions from '/imports/startup/client/actions/group';
import { findBounds } from '/lib/_map_utilities';
import Loading from '/imports/ui/components/loading/loading';

// ____________________________________________________________ Child Components
import SelectCompany from '../_companies/SelectByName';
import AddInventory from './Create';
import InventoryAdjust from './Adjust';
import ResultsSample from './Inventories/ResultsSample';
import InspectorCard from './Inventories/InspectorCard';
// import InventoriesMap from './Inventories/InventoriesMap';
// import InventoriesList from './Inventories/InventoriesList';
import UserGeolocation from '/imports/ui/containers/Geoposition';
import InventoriesMap from './InventoryMap';
import InventoryMove from './InventoryMove';
import InventoriesList from './InventoryList';
import InventoryFilters from './InventoryFilters';

var inspectId;

const CAN_VIEW_GLOBAL_INVENTORY = [
	'superadmin',
];

function getQueryVariable(variable) {
	var query = window.location.search.substring(1);
	var vars = query.split('&');
	for (var i = 0; i < vars.length; i++) {
		var pair = vars[i].split('=');
		if (decodeURIComponent(pair[0]) == variable) {
			return decodeURIComponent(pair[1]);
		}
	}
	return variable;
}

function getDefaults(proteins, tonnage, rfvs) {
	const defaults = {};

	if (proteins && proteins.length) {
		const array = _.filter(proteins, (v) => v > 0 && v < 100);
		const min = _.round(_.min(array), 2);
		const max = _.round(_.max(array), 2);
		defaults.pro = { max, min, cnt: proteins.length, m: (max - min) / 100 };
	}

	if (tonnage && tonnage.length) {
		const min = _.round(_.min(tonnage));
		const max = _.round(_.max(tonnage));
		defaults.ton = { max, min, cnt: tonnage.length, m: (max - min) / 100 };
	}

	if (rfvs && rfvs.length) {
		const array = _.filter(rfvs, (v) => v >= 0 && v < 350);
		const min = _.round(_.min(array), 1);
		const max = _.round(_.max(array), 1);
		defaults.rfv = { max, min, cnt: rfvs.length, m: (max - min) / 100 };
	}

	return defaults;
}

const types = PremierAg.define().inventory.types();
const verified = PremierAg.define().verified;
const products = (type) => PremierAg.define().inventory.product(type);


export const Actions = ({ pathname, groupId }) => (
	<ul id="menu-create-list" className="menu-list right animate">
		<li>
			<Link to={{ pathname, query: { create: 'inventory', for: groupId } }}>
				<i className="icon ion-cube" />Add New Inventory
			</Link>
		</li>
		<li>
			<Link to={{ pathname, query: { create: 'inventory', for: '3rd-party' } }}>
				<i className="icon ion-cube" />Add New 3rd Party Inventory
			</Link>
		</li>
	</ul>
);


class InventoriesMain extends React.Component {
	constructor(props) {
		super(props);
		// this.add = this.addfunction.bind(this);
		// this.add3rd = this.add3rdfunction.bind(this);
		if (props.location.query.id)
			this.setInspector = props.setInspector.bind(this, props.location.query.id);
	}

	componentDidMount() {
		analytics.page('Inventories');
		if (this.props.permissions.indexOf('superadmin') >= 0 && this.props.groupId) {
			this.props.setActionMenu(Actions, {
				pathname: this.props.location.pathname,
				groupId: this.props.groupId,
			});
		}
		this._setWidth();
		this._setHeight();
	}

	componentWillReceiveProps({ mainMenu, mapReady }) {
		if (mainMenu !== this.props.mainMenu) { this._setWidth(); }
		if (mainMenu !== this.props.mainMenu) { this._setHeight(); }
		// if (mapReady && !this.props.mapReady) { this._setActions(); }
	}

	_setActions() {
		this.props.setActionMenu(Actions, {
			addInventory: this.add,
			add3rdInventory: this.add3rd
		});
	}

	_setWidth() {
		const x = findDOMNode(this.refs.inventory);
		if (x) { this.props.setWidth(x.clientWidth); }
	}

	_setHeight() {
		const x = findDOMNode(this.refs.inventory);
		if (x) { this.props.setHeight(x.clientHeight); }
	}

	// addfunction() {
	// 	this.props.history.push('/inventory?create=inventory&for=' + this.props.groupId);
	// }

	// add3rdfunction() {
	// 	this.props.history.push('/inventory?create=inventory&for=3rd-party');
	// }

	render() {
		const style = { height: "100%" };
		return (
			<div ref="inventory" id="inventory">
				{this.props.loading && <div id="data-loading" style={style}>
					<div className="full">
						<div className="full-row">
							<div className="full-cell">

								<div className="text-center">
									<Loading color="white" size="large"/>
									<p className="text-strong text-center text-white">Loading</p>
								</div>

							</div>
						</div>
					</div>
				</div>}
				<Helmet
					title="Inventory"
				/>
				<UserGeolocation />

				{this.props.view === 'add' &&
					<AddInventory { ...this.props } />
				}

				{this.props.view === 'adjust' &&
					<InventoryAdjust { ...this.props } />
				}

				{this.props.view === 'move' &&
					<InventoryMove { ...this.props } />
				}

				{(this.props.view === 'map' || this.props.view === 'list') &&
					<InventoryFilters { ...this.props } />
				}

				{this.props.view === 'list' &&
					<InventoriesList {...this.props} />
				}

				{this.props.view !== 'list' && this.props.defaultsReady &&
					<InventoriesMap loading={this.props.loading} />
				}
			</div>
		);
	}
}


export default connect(({
			mainMenu,
	groupId,
	inventories: {
			viewGlobal,
		view,
		map: { height, width, defaultsReady, ready }
	}
}) => ({
		mainMenu,
		groupId,
		viewGlobal,
		view,
		width,
		height,
		defaultsReady,
		mapReady: ready
	}), (dispatch) => ({
		setWidth: (x) => dispatch(actions.setWidth(x)),
		setHeight: (x) => dispatch(actions.setHeight(x)),
		showAddView: (is3rd) => dispatch(actions.showAddView(is3rd)),
		mapDefaults: (zoom, cntr) => dispatch(actions.setMapDefaults(zoom, cntr)),
		setDefaults: (obj) => dispatch(actions.setDefault(obj)),

		// REQUIRED by <InventoryFilters />
		setInspector: (id) => dispatch(actions.inspectInventory(id)),
		showMapView: () => dispatch(actions.showMapView()),
		move: (location) => dispatch(actions.showMoveView(location)),
		moveHere: (location, flag, id) => dispatch(actions.showMoveHereView(location, flag, id)),
		adjust: (location) => dispatch(actions.showAdjustView(location)),
		showListView: () => dispatch(actions.showListView()),
		toggleGlobal: () => dispatch(actions.toggleGlobal()),
		setGlobal: (flag) => dispatch(actions.setGlobal(flag)),
		clearQuery: (prop) => dispatch(actions.clearInventoryQuery(prop)),
		setQuery: (prop, val) => dispatch(actions.queryInventory(prop, val)),
		setGroupId: (groupId) => dispatch(groupactions.setGroupId(groupId)),
	}))(createContainer(({
			viewGlobal,
		groupId,
		userId,
		user,
		width,
		height,
		defaultsReady,
		mapDefaults,
		setDefaults,
		toggleGlobal,
		setGlobal,
		setGroupId,
		isSuperadmin,
		permissions,
		location,
		move,
		moveHere,
		adjust,
		setInspector,
		view,
		showAddView,
		showMapView,
		showListView
	}) => {
		if (!groupId) {
			if (user && user.preferences) { setGroupId(user.preferences.defaultGroup); }
			groupId = user.preferences.defaultGroup;
		}
		const canViewGlobal = permissions.indexOf('superadmin') >= 0 ? true : false;
		if (canViewGlobal) {
			setGlobal(canViewGlobal);
			viewGlobal = true;
		}
		const handle = Meteor.subscribe('inventoriesMain', groupId, { viewGlobal });
		const query = viewGlobal ? {} : { ownerId: groupId };
		let total = 0;

		if (handle.ready()) {
			const proteins = [];
			const tonnage = [];
			const rfvs = [];
			const lats = [];
			const lngs = [];

			total = Inventories.find().count();

			Inventories.find(query).forEach(({ rfv, protein, stack, location }) => {
				if (rfv) { rfvs.push(rfv); }
				if (protein) { proteins.push(protein); }
				if (stack && stack.tons) { tonnage.push(stack.tons); }
				if (location && location.latitude && location.longitude) {
					lats.push(location.latitude);
					lngs.push(location.longitude);
				}
			});

			setDefaults(getDefaults(proteins, tonnage, rfvs));

			if (location.query && !location.query.reset) {
				if (getQueryVariable('create') === 'inventory' && !(window.location.search.indexOf('reset') === 1)) {
					if (getQueryVariable('for') === '3rd-party') {
						showAddView(true);
					} else {
						showAddView(false);
					}
				}
				else if (getQueryVariable('action') === 'move' && !(window.location.search.indexOf('reset') === 1)) {
					setInspector(getQueryVariable('id'));
					move({ longitude: parseFloat(getQueryVariable('longitude')), latitude: parseFloat(getQueryVariable('latitude')) });
				}
				else if (getQueryVariable('action') === 'movehere' && !(window.location.search.indexOf('reset') === 1)) {
					setInspector(getQueryVariable('id'));
					moveHere({ location: { longitude: parseFloat(getQueryVariable('longitude')), latitude: parseFloat(getQueryVariable('latitude')) } }, true, getQueryVariable('id')); 
				}
				else if (getQueryVariable('action') === 'adjust' && !(window.location.search.indexOf('reset') === 1)) {
					setInspector(getQueryVariable('id'));
					adjust({ longitude: parseFloat(getQueryVariable('longitude')), latitude: parseFloat(getQueryVariable('latitude')) });
				}
				else {
					if (view === 'list' || getQueryVariable('action') === 'list')
						showListView();
					else
						showMapView();
					// setInspector(null);
				}
			}

			if (!defaultsReady) {
				const mapConfigs = findBounds(lats, lngs, { width, height });
				mapDefaults(mapConfigs);
			}
		}

		return {
			total,
			canViewGlobal,
			loading: !handle.ready(),
			groupId
		};
	}, InventoriesMain));


InventoriesMain.propTypes = {
	groupId: PropTypes.string,
	inspect: PropTypes.string,
	height: PropTypes.number.isRequired,
	width: PropTypes.number.isRequired,
	geolocation: PropTypes.shape({
		lat: PropTypes.number.isRequired,
		lng: PropTypes.number.isRequired,
	}),
	renderAlert: PropTypes.func.isRequired,
	setWidth: PropTypes.func.isRequired,
	showAddView: PropTypes.func.isRequired,
	setDefaults: PropTypes.func.isRequired,
	defaultsReady: PropTypes.bool.isRequired,
	isSuperadmin: PropTypes.bool, 
	viewGlobal: PropTypes.bool.isRequired,
	loading: PropTypes.bool.isRequired,
};

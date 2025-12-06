require('dotenv').config({path:__dirname+'/./../.env'});

const { Sequelize, Model, DataTypes } = require('sequelize');

const sequelize = new Sequelize(
	...(process.env.DB_LOCAL
	? [process.env.DBL_DATABASE, process.env.DBL_USERNAME, process.env.DBL_PASSWORD]
	: [process.env.DB_DATABASE, process.env.DB_USERNAME, process.env.DB_PASSWORD]),
	{
		define : { underscored : true },
		host: process.env.DB_LOCAL ? process.env.DBL_HOST : process.env.DB_HOST,
		port: process.env.DB_LOCAL ? process.env.DBL_PORT : process.env.DB_PORT,
		dialect: process.env.DB_LOCAL ? process.env.DBL_CONNECTION : process.env.DB_CONNECTION, /* one of 'mysql' | 'mariadb' | 'postgres' | 'mssql' */
		dialectOptions: {
			multipleStatements: true
		},
		pool: {
			max: 5,
			min: 0,
			idle: 10000
		},
		logging: false
	}
);

class WhatsappService extends Model {}
WhatsappService.init({
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true
	},
	admin_id : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	cost_per_message : {
		type: DataTypes.DOUBLE,
	},
	cost_per_forward : {
		type: DataTypes.DOUBLE,
	},
	name : {
		type: DataTypes.STRING,
		allowNull : true
	},
	phone_auth : {
		type: DataTypes.STRING,
		allowNull : true
	},
	latest_phone_auth : {
		type: DataTypes.STRING,
		allowNull : true
	},
	session : {
		type: DataTypes.STRING,
		allowNull : true
	},
	jwt_token : {
		type: DataTypes.STRING,
		allowNull : true
	},
	is_credit_show : {
		type: DataTypes.BOOLEAN,
	},
	is_forward : {
		type: DataTypes.BOOLEAN,
	},
	is_main_forward : {
		type: DataTypes.BOOLEAN,
	},
	is_specified_forward : {
		type: DataTypes.BOOLEAN,
	},
	is_out_forward : {
		type: DataTypes.BOOLEAN,
	},
	is_out_main_forward : {
		type: DataTypes.BOOLEAN,
	},
	is_out_specified_forward : {
		type: DataTypes.BOOLEAN,
	},
	is_chat_bot_google : {
		type: DataTypes.BOOLEAN,
	},
	is_chat_welcome_message : {
		type: DataTypes.BOOLEAN,
	},
	is_chat_away_message : {
		type: DataTypes.BOOLEAN,
	},
	// is_migrated_whiskey : {
	// 	type: DataTypes.BOOLEAN,
	// },
	send_notification : {
		type: DataTypes.BOOLEAN,
	},
	message_send_interval  : {
		type: DataTypes.INTEGER,
	},
    whatsapp_chat_history_mode : {
		type: DataTypes.CHAR,
		allowNull : true
	},
    feature_custom_interval : {
		type: DataTypes.BOOLEAN,
	},
    is_custom_interval : {
		type: DataTypes.BOOLEAN,
	},
    custom_interval : {
		type: DataTypes.CHAR,
	},
    feature_whatsapp_chat_history : {
		type: DataTypes.BOOLEAN,
	},
    feature_jwt_token : {
		type: DataTypes.BOOLEAN,
	},
    feature_forward : {
		type: DataTypes.BOOLEAN,
	},
    feature_out_forward : {
		type: DataTypes.BOOLEAN,
	},
    feature_cs : {
		type: DataTypes.BOOLEAN,
	},
		feature_chat_bot_google : {
		type: DataTypes.BOOLEAN,
	},
		is_waha_system : {
		type: DataTypes.BOOLEAN,
	},
}, { sequelize, tableName : "whatsapp_services", modelName : "whatsapp_services", defaultScope: { where: { is_waha_system: false } } });

class MessageSentLog extends Model {}
MessageSentLog.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
	whatsapp_service_id : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	second_of_message_id : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	message : {
		type: DataTypes.STRING,
		allowNull : true
	},
	raw_content: {
		type: DataTypes.JSON,
		allowNull : true
	},
	generated_content: {
		type: DataTypes.JSON,
		allowNull : true
	},
	status : {
		type: DataTypes.STRING,
		allowNull : true
	},
	event : {
		type: DataTypes.STRING,
		allowNull : true
	},
	id_forward_from : {
		type: DataTypes.CHAR,
		allowNull : true
	},
	source_json : {
		type: DataTypes.JSON,
		allowNull : true
	},
	forward_from : {
		type: DataTypes.CHAR,
		allowNull : true
	},
	forward_sender_id : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	message_sent_log_id : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	sender_by : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	phone_auth : {
		type: DataTypes.STRING,
		allowNull : true
	},
	processed_messages : {
		type: DataTypes.INTEGER
	},
	phone_column : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	schedule : {
		type: DataTypes.DATE,
		allowNull : true
	},
	send_at : {
		type: DataTypes.DATE,
		allowNull : true
	},
}, { sequelize, tableName : "message_sent_logs", modelName : "message_sent_logs" });

class MessageNumberSentLog extends Model {}
MessageNumberSentLog.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
	message_sent_log_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	number : {
		type: DataTypes.STRING,
		allowNull : true
	},
	entity : {
		type: DataTypes.JSON,
		allowNull : true
	},
	status : {
		type: DataTypes.STRING,
		allowNull : true
	},
	host : {
		type: DataTypes.STRING,
		allowNull : true
	},
	id_stanza : {
		type: DataTypes.CHAR,
		allowNull : true
	},
	send_json : {
		type: DataTypes.JSON,
		allowNull : true
	},
	response : {
		type: DataTypes.STRING,
		allowNull : true
	},
	cost_credits : {
		type: DataTypes.FLOAT,
	},
}, { sequelize, tableName : "message_number_sent_logs", modelName : "message_number_sent_logs" });

class MessageMediaSentLog extends Model {}
MessageMediaSentLog.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
	message_sent_log_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	name : {
		type: DataTypes.STRING,
		allowNull : true
	},
	extension : {
		type: DataTypes.STRING,
		allowNull : true
	},
	url : {
		type: DataTypes.STRING,
		allowNull : true
	},
}, { sequelize, tableName : "message_media_sent_logs", modelName : "message_media_sent_logs" });

class Contact extends Model {}
Contact.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
	whatsapp_auth : {
		type: DataTypes.STRING,
	},
	name : {
		type: DataTypes.STRING,
		allowNull : true
	},
	number : {
		type: DataTypes.STRING,
	},
}, { sequelize, tableName : "contacts", modelName : "contacts" });

class GroupContact extends Model {}
GroupContact.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
	whatsapp_auth : {
		type: DataTypes.STRING,
	},
	name : {
		type: DataTypes.STRING,
		allowNull : true
	},
	number : {
		type: DataTypes.STRING,
	},
}, { sequelize, tableName : "group_contacts", modelName : "group_contacts" });

class Subscription extends Model {}
Subscription.init({
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true
  },
	user_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	status : {
		type: DataTypes.STRING,
	},
}, { sequelize, tableName : "subscriptions", modelName : "subscriptions" })

class User extends Model {}
User.init({
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true
	},
	name : {
		type: DataTypes.STRING,
		allowNull : true
	},
	phone : {
		type: DataTypes.STRING,
		allowNull : true
	},
	credits : {
		type: DataTypes.DOUBLE,
	},
	is_subscription_service : {
		type: DataTypes.BOOLEAN
	}
}, { sequelize, tableName : "users", modelName : "users" });

class CreditHistory extends Model {}
CreditHistory.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
	credit_topup_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	message_sent_log_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	user_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	event : {
		type: DataTypes.STRING,
		allowNull : true
	},
	description : {
		type: DataTypes.STRING,
		allowNull : true
	},
	credit_before_changes : {
		type: DataTypes.FLOAT,
	},
	amount_change_in_credits : {
		type: DataTypes.FLOAT,
	},
	latest_credit : {
		type: DataTypes.FLOAT,
	},
}, { sequelize, tableName : "credit_histories", modelName : "credit_histories" });

class ForwardReceiver extends Model {}
ForwardReceiver.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
	whatsapp_service_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	forward_sender_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	name : {
		type: DataTypes.STRING,
		allowNull : true
	},
	can_reply : {
		type: DataTypes.BOOLEAN
	},
	number : {
		type: DataTypes.CHAR
	},
}, { sequelize, tableName : "forward_receivers", modelName : "forward_receivers" });

class ForwardIgnore extends Model {}
ForwardIgnore.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
	whatsapp_service_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	name : {
		type: DataTypes.STRING,
		allowNull : true
	},
	number : {
		type: DataTypes.CHAR
	},
}, { sequelize, tableName : "forward_ignores", modelName : "forward_ignores" });

class ForwardSender extends Model {}
ForwardSender.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
	whatsapp_service_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	name : {
		type: DataTypes.STRING,
		allowNull : true
	},
	number : {
		type: DataTypes.CHAR
	},
}, { sequelize, tableName : "forward_senders", modelName : "forward_senders" });

class OutForwardReceiver extends Model {}
OutForwardReceiver.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
	whatsapp_service_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	out_forward_sender_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	name : {
		type: DataTypes.STRING,
		allowNull : true
	},
	can_reply : {
		type: DataTypes.BOOLEAN
	},
	number : {
		type: DataTypes.CHAR
	},
}, { sequelize, tableName : "out_forward_receivers", modelName : "out_forward_receivers" });

class OutForwardIgnore extends Model {}
OutForwardIgnore.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
	whatsapp_service_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	name : {
		type: DataTypes.STRING,
		allowNull : true
	},
	number : {
		type: DataTypes.CHAR
	},
}, { sequelize, tableName : "out_forward_ignores", modelName : "out_forward_ignores" });

class OutForwardSender extends Model {}
OutForwardSender.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
	whatsapp_service_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	name : {
		type: DataTypes.STRING,
		allowNull : true
	},
	number : {
		type: DataTypes.CHAR
	},
}, { sequelize, tableName : "out_forward_senders", modelName : "out_forward_senders" });

class ChatContact extends Model {}
ChatContact.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
	whatsapp_service_id  : {
		type: DataTypes.INTEGER,
		allowNull : true
	},
	name : {
		type: DataTypes.STRING,
		allowNull : true
	},
	number : {
		type: DataTypes.CHAR
	},
	except_mode : {
		type: DataTypes.CHAR
	},
}, { sequelize, tableName : "chat_contacts", modelName : "chat_contacts" });

class ChatbotSheets extends Model {}
ChatbotSheets.init({
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true
	},
	whatsapp_service_id  : {
		type: DataTypes.INTEGER,
	},
	row  : {
		type: DataTypes.INTEGER,
		allowNull: true,
	},
	message : {
		type: DataTypes.STRING,
		allowNull: true,
	},
	interval : {
		type: DataTypes.BIGINT,
		allowNull: true,
	},
	reply : {
		type: DataTypes.STRING,
	},
	type : {
		type: DataTypes.CHAR
	},
}, { sequelize, tableName : "chatbot_sheets", modelName : "chatbot_sheets" });


function upsert(model, values, condition) {
    return model
	.findOne({ where: condition })
	.then(function(obj) {
		// update
		if(obj) {
			if (obj.name === values.name) return
			return obj.update(values);
		}
		// insert
		return model.create(values);
	})
}

ChatContact.belongsTo(WhatsappService, {
	foreignKey: "whatsapp_service_id",
	targetKey: "id",
	as: "whatsappService"
});
MessageSentLog.belongsTo(User, {
	foreignKey: "sender_by",
	targetKey: "id",
	as: "sender"
});
MessageSentLog.belongsTo(MessageSentLog, {
	foreignKey: "second_of_message_id",
	targetKey: "id",
	as: "secondOfMessage"
});
MessageMediaSentLog.belongsTo(MessageSentLog, {
	foreignKey: "message_sent_log_id",
	targetKey: "id",
	as: "messageSentLog"
});
MessageNumberSentLog.belongsTo(MessageSentLog, {
	foreignKey: "message_sent_log_id",
	targetKey: "id",
	as: "messageSentLog"
});
MessageSentLog.belongsTo(ForwardSender, {
	foreignKey: "forward_sender_id",
	targetKey: "id",
	as: "forwardSender"
});
MessageSentLog.belongsTo(OutForwardSender, {
	foreignKey: "out_forward_sender_id",
	targetKey: "id",
	as: "outForwardSender"
});
MessageSentLog.belongsTo(WhatsappService, {
	foreignKey: "whatsapp_service_id",
	targetKey: "id",
	as: "whatsappService"
});
ForwardReceiver.belongsTo(WhatsappService, {
	foreignKey: "whatsapp_service_id",
	targetKey: "id",
	as: "whatsappService"
});
ForwardReceiver.belongsTo(ForwardSender, {
	foreignKey: "forward_sender_id",
	targetKey: "id",
	as: "forwardSender"
});
ForwardIgnore.belongsTo(WhatsappService, {
	foreignKey: "whatsapp_service_id",
	targetKey: "id",
	as: "whatsappService"
});
ForwardSender.belongsTo(WhatsappService, {
	foreignKey: "whatsapp_service_id",
	targetKey: "id",
	as: "whatsappService"
});
ForwardSender.hasMany(ForwardReceiver, {
	foreignKey: "forward_sender_id",
	sourceKey: "id",
	as: "forwardReceivers"
});
ForwardSender.hasOne(ForwardReceiver, {
	foreignKey: "forward_sender_id",
	sourceKey: "id",
	as: "forwardReceiver"
});
//----------
OutForwardReceiver.belongsTo(WhatsappService, {
	foreignKey: "whatsapp_service_id",
	targetKey: "id",
	as: "whatsappService"
});
OutForwardReceiver.belongsTo(OutForwardSender, {
	foreignKey: "out_forward_sender_id",
	targetKey: "id",
	as: "outForwardSender"
});
OutForwardIgnore.belongsTo(WhatsappService, {
	foreignKey: "whatsapp_service_id",
	targetKey: "id",
	as: "whatsappService"
});
OutForwardSender.belongsTo(WhatsappService, {
	foreignKey: "whatsapp_service_id",
	targetKey: "id",
	as: "whatsappService"
});
OutForwardSender.hasMany(OutForwardReceiver, {
	foreignKey: "out_forward_sender_id",
	sourceKey: "id",
	as: "outForwardReceivers"
});
OutForwardSender.hasOne(OutForwardReceiver, {
	foreignKey: "out_forward_sender_id",
	sourceKey: "id",
	as: "outForwardReceiver"
});
//---------------
WhatsappService.hasMany(ChatbotSheets, {
	foreignKey: "whatsapp_service_id",
	sourceKey: "id",
	as: "chatbotSheets"
});
WhatsappService.hasMany(ChatContact, {
	foreignKey: "whatsapp_service_id",
	sourceKey: "id",
	as: "chatContacts"
});
WhatsappService.hasMany(MessageSentLog, {
	foreignKey: "whatsapp_service_id",
	sourceKey: "id",
	as: "messageSentLogs"
});
WhatsappService.hasOne(MessageSentLog, {
	foreignKey: "whatsapp_service_id",
	sourceKey: "id",
	as: "messageSentLog"
});
WhatsappService.hasMany(ForwardReceiver, {
	foreignKey: "whatsapp_service_id",
	sourceKey: "id",
	as: "forwardReceivers"
});
WhatsappService.hasMany(ForwardSender, {
	foreignKey: "whatsapp_service_id",
	sourceKey: "id",
	as: "forwardSenders"
});
WhatsappService.hasOne(ForwardIgnore, {
	foreignKey: "whatsapp_service_id",
	sourceKey: "id",
	as: "forwardIgnore"
});
WhatsappService.hasMany(OutForwardReceiver, {
	foreignKey: "whatsapp_service_id",
	sourceKey: "id",
	as: "outForwardReceivers"
});
WhatsappService.hasMany(OutForwardSender, {
	foreignKey: "whatsapp_service_id",
	sourceKey: "id",
	as: "outForwardSenders"
});
WhatsappService.hasOne(OutForwardIgnore, {
	foreignKey: "whatsapp_service_id",
	sourceKey: "id",
	as: "outForwardIgnore"
});
WhatsappService.belongsTo(User, {
	foreignKey: "admin_id",
	targetKey: "id",
	as: "user"
});
MessageSentLog.hasMany(MessageSentLog, {
	foreignKey: "second_of_message_id",
	sourceKey: "id",
	as: "secondOfMessages"
});
MessageSentLog.hasMany(MessageNumberSentLog, {
	foreignKey: "message_sent_log_id",
	sourceKey: "id",
	as: "messageNumberSentLogs"
});
MessageSentLog.hasOne(MessageNumberSentLog, {
	foreignKey: "message_sent_log_id",
	sourceKey: "id",
	as: "messageNumberSentLog"
});
MessageSentLog.hasMany(MessageMediaSentLog, {
	foreignKey: "message_sent_log_id",
	sourceKey: "id",
	as: "messageMediaSentLogs"
});
MessageSentLog.hasOne(MessageMediaSentLog, {
	foreignKey: "message_sent_log_id",
	sourceKey: "id",
	as: "messageMediaSentLog"
});
MessageSentLog.hasOne(CreditHistory, {
	foreignKey: "message_sent_log_id",
	sourceKey: "id",
	as: "creditHistory"
});
//------------
User.hasOne(Subscription, {
	foreignKey: "user_id",
	sourceKey: "id",
	as: "subscription"
});


exports.WhatsappService = WhatsappService;
exports.MessageSentLog = MessageSentLog;
exports.MessageNumberSentLog = MessageNumberSentLog;
exports.MessageMediaSentLog = MessageMediaSentLog;
exports.ChatContact = ChatContact;
exports.Contact = Contact;
exports.GroupContact = GroupContact;
exports.User = User;
exports.Subscription = Subscription;
exports.ForwardReceiver = ForwardReceiver;
exports.ForwardSender = ForwardSender;
exports.OutForwardReceiver = OutForwardReceiver;
exports.OutForwardSender = OutForwardSender;
exports.ChatbotSheets = ChatbotSheets;
exports.upsert = upsert;
exports.sequelize = sequelize;

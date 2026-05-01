import { relations } from "drizzle-orm/relations";
import { exercises, formAnalyses, workoutSessions, profiles, habits, clientProfiles, usersInAuth, clientHabits, foodLog, waterLog, supplementProtocols, supplementLog, apiUsageLog, coachNotes, clientSupplements, habitCheckins, customFoods, measurements, workoutSets, workoutTemplates } from "./schema";

export const formAnalysesRelations = relations(formAnalyses, ({one}) => ({
	exercise: one(exercises, {
		fields: [formAnalyses.exerciseId],
		references: [exercises.id]
	}),
	workoutSession: one(workoutSessions, {
		fields: [formAnalyses.sessionId],
		references: [workoutSessions.id]
	}),
	profile: one(profiles, {
		fields: [formAnalyses.userId],
		references: [profiles.id]
	}),
}));

export const exercisesRelations = relations(exercises, ({one, many}) => ({
	formAnalyses: many(formAnalyses),
	workoutSets: many(workoutSets),
	profile: one(profiles, {
		fields: [exercises.createdBy],
		references: [profiles.id]
	}),
}));

export const workoutSessionsRelations = relations(workoutSessions, ({one, many}) => ({
	formAnalyses: many(formAnalyses),
	workoutSets: many(workoutSets),
	profile: one(profiles, {
		fields: [workoutSessions.userId],
		references: [profiles.id]
	}),
}));

export const profilesRelations = relations(profiles, ({one, many}) => ({
	formAnalyses: many(formAnalyses),
	habits: many(habits),
	clientProfiles_coachId: many(clientProfiles, {
		relationName: "clientProfiles_coachId_profiles_id"
	}),
	clientProfiles_userId: many(clientProfiles, {
		relationName: "clientProfiles_userId_profiles_id"
	}),
	usersInAuth: one(usersInAuth, {
		fields: [profiles.id],
		references: [usersInAuth.id]
	}),
	clientHabits_assignedBy: many(clientHabits, {
		relationName: "clientHabits_assignedBy_profiles_id"
	}),
	clientHabits_clientId: many(clientHabits, {
		relationName: "clientHabits_clientId_profiles_id"
	}),
	foodLogs: many(foodLog),
	waterLogs: many(waterLog),
	supplementProtocols: many(supplementProtocols),
	supplementLogs: many(supplementLog),
	apiUsageLogs: many(apiUsageLog),
	coachNotes_clientId: many(coachNotes, {
		relationName: "coachNotes_clientId_profiles_id"
	}),
	coachNotes_coachId: many(coachNotes, {
		relationName: "coachNotes_coachId_profiles_id"
	}),
	clientSupplements_assignedBy: many(clientSupplements, {
		relationName: "clientSupplements_assignedBy_profiles_id"
	}),
	clientSupplements_userId: many(clientSupplements, {
		relationName: "clientSupplements_userId_profiles_id"
	}),
	habitCheckins: many(habitCheckins),
	customFoods: many(customFoods),
	measurements: many(measurements),
	workoutTemplates: many(workoutTemplates),
	exercises: many(exercises),
	workoutSessions: many(workoutSessions),
}));

export const habitsRelations = relations(habits, ({one, many}) => ({
	profile: one(profiles, {
		fields: [habits.createdBy],
		references: [profiles.id]
	}),
	clientHabits: many(clientHabits),
}));

export const clientProfilesRelations = relations(clientProfiles, ({one}) => ({
	profile_coachId: one(profiles, {
		fields: [clientProfiles.coachId],
		references: [profiles.id],
		relationName: "clientProfiles_coachId_profiles_id"
	}),
	profile_userId: one(profiles, {
		fields: [clientProfiles.userId],
		references: [profiles.id],
		relationName: "clientProfiles_userId_profiles_id"
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	profiles: many(profiles),
}));

export const clientHabitsRelations = relations(clientHabits, ({one, many}) => ({
	profile_assignedBy: one(profiles, {
		fields: [clientHabits.assignedBy],
		references: [profiles.id],
		relationName: "clientHabits_assignedBy_profiles_id"
	}),
	profile_clientId: one(profiles, {
		fields: [clientHabits.clientId],
		references: [profiles.id],
		relationName: "clientHabits_clientId_profiles_id"
	}),
	habit: one(habits, {
		fields: [clientHabits.habitId],
		references: [habits.id]
	}),
	habitCheckins: many(habitCheckins),
}));

export const foodLogRelations = relations(foodLog, ({one}) => ({
	profile: one(profiles, {
		fields: [foodLog.userId],
		references: [profiles.id]
	}),
}));

export const waterLogRelations = relations(waterLog, ({one}) => ({
	profile: one(profiles, {
		fields: [waterLog.userId],
		references: [profiles.id]
	}),
}));

export const supplementProtocolsRelations = relations(supplementProtocols, ({one, many}) => ({
	profile: one(profiles, {
		fields: [supplementProtocols.coachId],
		references: [profiles.id]
	}),
	clientSupplements: many(clientSupplements),
}));

export const supplementLogRelations = relations(supplementLog, ({one}) => ({
	profile: one(profiles, {
		fields: [supplementLog.userId],
		references: [profiles.id]
	}),
}));

export const apiUsageLogRelations = relations(apiUsageLog, ({one}) => ({
	profile: one(profiles, {
		fields: [apiUsageLog.userId],
		references: [profiles.id]
	}),
}));

export const coachNotesRelations = relations(coachNotes, ({one}) => ({
	profile_clientId: one(profiles, {
		fields: [coachNotes.clientId],
		references: [profiles.id],
		relationName: "coachNotes_clientId_profiles_id"
	}),
	profile_coachId: one(profiles, {
		fields: [coachNotes.coachId],
		references: [profiles.id],
		relationName: "coachNotes_coachId_profiles_id"
	}),
}));

export const clientSupplementsRelations = relations(clientSupplements, ({one}) => ({
	profile_assignedBy: one(profiles, {
		fields: [clientSupplements.assignedBy],
		references: [profiles.id],
		relationName: "clientSupplements_assignedBy_profiles_id"
	}),
	supplementProtocol: one(supplementProtocols, {
		fields: [clientSupplements.protocolId],
		references: [supplementProtocols.id]
	}),
	profile_userId: one(profiles, {
		fields: [clientSupplements.userId],
		references: [profiles.id],
		relationName: "clientSupplements_userId_profiles_id"
	}),
}));

export const habitCheckinsRelations = relations(habitCheckins, ({one}) => ({
	clientHabit: one(clientHabits, {
		fields: [habitCheckins.clientHabitId],
		references: [clientHabits.id]
	}),
	profile: one(profiles, {
		fields: [habitCheckins.userId],
		references: [profiles.id]
	}),
}));

export const customFoodsRelations = relations(customFoods, ({one}) => ({
	profile: one(profiles, {
		fields: [customFoods.createdBy],
		references: [profiles.id]
	}),
}));

export const measurementsRelations = relations(measurements, ({one}) => ({
	profile: one(profiles, {
		fields: [measurements.userId],
		references: [profiles.id]
	}),
}));

export const workoutSetsRelations = relations(workoutSets, ({one}) => ({
	exercise: one(exercises, {
		fields: [workoutSets.exerciseId],
		references: [exercises.id]
	}),
	workoutSession: one(workoutSessions, {
		fields: [workoutSets.sessionId],
		references: [workoutSessions.id]
	}),
}));

export const workoutTemplatesRelations = relations(workoutTemplates, ({one}) => ({
	profile: one(profiles, {
		fields: [workoutTemplates.createdBy],
		references: [profiles.id]
	}),
}));
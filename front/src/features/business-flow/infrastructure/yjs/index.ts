export type BusinessFlowCollaborationOwner =
  | {
      ownerType: 'BUSINESS_FLOW'
      ownerId: string
    }
  | {
      ownerType: 'SWIMLANE_COMPONENT_DRAFT'
      ownerId: string
    }

export * from './businessFlowCollaboration'

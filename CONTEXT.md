# Directory Platform

The Directory Platform context names the public catalog and private intake concepts shared by the independently operated directories.

## Language

**Site**:
An independently operated directory identity with its own public catalog and publication state.
_Avoid_: Tenant, directory instance

**Listing**:
A curated catalog entry that may be published by a Site.
_Avoid_: Product, website record, item

**Category**:
A named taxonomy classification used to organize Listings within a Site.
_Avoid_: Tag, collection

**Publication**:
A reviewed change to a Site's public catalog that advances its recorded version and checksum.
_Avoid_: Sync, import, catalog edit

**Submission**:
A privately staged proposal for a Listing that has not entered the public catalog.
_Avoid_: Draft Listing, pending Listing

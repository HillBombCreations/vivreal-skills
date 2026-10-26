---
description: Make or rebuild Vivreal business cards (front plus a portrait back with a QR code that credits the card), shown to you before they are called done, copied to your folder
argument-hint: new <first name>, or rebuild [slug], or copy [folder]
---

Make or rebuild business cards: $ARGUMENTS

Dispatch the `business-card-maker` agent (run_in_background: false) with the request from the
arguments. For a new card it asks you for the name, title and email and confirms the email is a
real vivreal.io mailbox; it never makes them up.

Relay what it returns: the cards made, each front and back it showed you, the folder it copied
to and whether every copy matched byte for byte. It stops at print files: it never orders
printing and never commits unless you tell it to.

Remind the user: upload the PDFs where the printer accepts them, card sign-ups are counted only
when the visitor accepts the cookie banner, and the QR codes never expire.

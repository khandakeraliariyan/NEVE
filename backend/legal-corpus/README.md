# Legal corpus

Each file here is one legal source, ready to load as a **draft** with
`npm run import-legal-sources`. Nothing in this folder is used by Neve until
a legal reviewer has checked the source against the official text and
approved it in the workspace (**Legal review → Legal sources**).

| File | Source | Text | Retrieved from |
|---|---|---|---|
| `bd-premises-rent-control-act-1991.json` | বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১ (Act No. 3 of 1991), all 36 sections | Official Bangla text | <https://bdlaws.minlaw.gov.bd/act-details-748.html> |
| `bd-transfer-of-property-act-1882-ch5.json` | The Transfer of Property Act, 1882 (Act No. IV of 1882), Chapter V: leases, sections 105-117 | Official English text | Internet Archive copy (2024-08-05) of <https://bdlaws.minlaw.gov.bd/act-48/chapter-details-164.html>; the live page timed out. **Compare with the live page before approving.** |

The Contract Act, 1872 is not included yet: it is long and only a few
sections bear on tenancies, so a legal reviewer should choose them.

## Rules for adding a source

- Copy the text from the official publisher (the Laws of Bangladesh website,
  run by the Legislative and Parliamentary Affairs Division). Don't paraphrase,
  translate, summarize or "fix" the text, and don't write it from memory or
  with an AI model.
- Record where and when you copied it in `provenance`. Set `textOrigin` to
  `unofficial_copy` or `unofficial_translation` if it didn't come from the
  official publisher; the review history then says so.
- `topics` on each section are Neve retrieval tags, not part of the law.
- A file can't set a status. Imports always create a draft (or, with
  `--submit`, a version in review), and a new version of an existing source
  only when it has no draft or version in review.

## Loading

```bash
cd backend
npm run import-legal-sources -- --dry-run legal-corpus/*.json            # validate only
npm run import-legal-sources -- --as admin@example.com --submit legal-corpus/*.json
```

Then a legal reviewer opens each source, compares it with the official page,
and approves it. Approval makes it available to Legal Copilot and to the legal
references on contract-risk findings.

## Known limitations

- The Premises Rent Control Act text is Bangla. Keyword retrieval matches
  Bangla questions word for word, and English questions only through the
  section topic tags, so English questions get broader, less precise matches.
- Section 1(2) gives the Act area-by-area and retrospective commencement. The
  file does not record which areas it is in force in; check the gazette
  notifications for the property's area.

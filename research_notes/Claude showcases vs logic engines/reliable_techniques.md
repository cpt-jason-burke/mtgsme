# Reliable techniques for a non-programmer building a rules/logic engine with Claude / Claude Code

Research date: 2026-11-21. Ranked by impact (highest first) in the summary below; each key question follows in the required format.

Network note for the report writer: arxiv.org, simonwillison.net and camunda.com were blocked in this research session, so claims from those sites come from search-result snippets and secondary summaries, not the full pages. The main Anthropic source (code.claude.com best-practices page) was read in full. The old Anthropic engineering post "Claude Code: Best practices for agentic coding" (anthropic.com/engineering/claude-code-best-practices) now 308-redirects to that docs page, so the docs page is the current official version.

Impact ranking (my synthesis, see inferences below):
1. Give Claude a pass/fail check it can run itself (golden test cases: real input -> expected answer), and ask for the evidence (the command and its output), not "done".
2. Write the cases and a plain-language spec before building; let Claude interview you to produce it.
3. One rule / one small step at a time, each saved as a working version (git commit) you can roll back to.
4. Make the engine show its work (which rule fired, with a citation) so a wrong answer is visible to a non-coder.
5. Keep rules as readable data (tables/lists) with an explicit order of precedence and an explicit "nothing matched" outcome.
6. Fresh session for each unrelated task; after two failed corrections, start over with a better prompt.
7. Have a second, fresh session (or reviewer subagent) check the work against the spec, correctness only.
8. Put true "never/always" rules in enforced settings (hooks/deny rules), not just in CLAUDE.md.

## What does Anthropic officially recommend?

### Takeaway
Anthropic's current Claude Code guidance boils down to three things: tell Claude what it can't see (decisions, the spec, the exact test command), give it a pass/fail check to run so it can close the loop itself and show you evidence, and enforce must-never-break rules with hooks or deny rules rather than more emphatic wording. Supporting habits: interview-to-spec then build in a fresh session, `/clear` between tasks, restart after two failed corrections, and an independent reviewer that never saw the code being written.

### Cited Findings
- The page's own summary: "Get more out of Claude Code: tell Claude what it can't see, give it a check to run, and enforce the rules that can't have exceptions." — [Claude Code docs: Best practices](https://code.claude.com/docs/en/best-practices)
- Diagnosis of failed sessions: "Claude said it was done and it wasn't quite, usually because it had no way to check its own work." — [Best practices](https://code.claude.com/docs/en/best-practices)
- Core verification principle: "Claude stops when the work looks done. If it has nothing to run that tells it whether the work actually *is* done, 'looks done' is all it has to go on. In practice that makes you the test suite, and every mistake sits there until you happen to notice it." — [Best practices](https://code.claude.com/docs/en/best-practices)
- "Give Claude something it can run that comes back pass or fail. Once it has that, it can keep going on its own and you don't have to watch." Valid checks include "A test file", "A build's exit code", "A linter", "A script that diffs output against a fixture", "A browser screenshot next to the mockup." — [Best practices](https://code.claude.com/docs/en/best-practices)
- "If your repo already has one of these, the single most useful line in your `CLAUDE.md` is the command that runs it." — [Best practices](https://code.claude.com/docs/en/best-practices)
- Ask for evidence: "ask Claude for *evidence*: the command it ran and its output, or the screenshot. 'All tests pass' on its own tells you very little, and reading the output is faster than rerunning the check yourself." — [Best practices](https://code.claude.com/docs/en/best-practices)
- Strictness ladder for the check: in the prompt ("run the auth tests after, and keep going until they pass"), as a `/goal` (a separate model checks the condition after every turn), as a `Stop` hook (harness blocks the turn from ending until the script passes), or by "someone who didn't write the code" via `/code-review`, which "reviews the diff in a fresh subagent that never saw your conversation. It isn't swayed by the reasoning that produced the code." — [Best practices](https://code.claude.com/docs/en/best-practices)
- `/verify` after Claude says it's done "has Claude build and run the app and look at the result. That catches the kind of problem that tests and typechecks miss." — [Best practices](https://code.claude.com/docs/en/best-practices)
- Specific prompts: example rewrite of "fix the login bug" into "...write a failing test that reproduces it, then fix it"; "If you name the file, describe the symptom, and say what 'fixed' looks like up front, you usually save yourself a round of corrections later." — [Best practices](https://code.claude.com/docs/en/best-practices)
- "be ambitious" is the one phrase that still helps, because "Claude tends to read a request conservatively and build the smallest thing that satisfies it"; it tells Claude about scope (e.g. edge cases), "which only you know". Phrases like "think step by step" / "be thorough" are ordinary text; effort level is the real control. — [Best practices](https://code.claude.com/docs/en/best-practices)
- Interview first: "Ask Claude to interview you instead: 'I want to add rate limiting ... Interview me until you could write the spec, then write it to SPEC.md.'" Claude "comes back with multiple-choice questions about the parts you haven't pinned down ... what's out of scope." Then: "Once `SPEC.md` exists, start a fresh session to build from it, so the build begins with a clean context and a written definition of done." — [Best practices](https://code.claude.com/docs/en/best-practices)
- CLAUDE.md should be short and hold only what Claude can't find in the code: the exact test commands, misleading places in the code, decisions not in the repo, "Anything you've had to correct twice already." The memory guide "recommends staying under 200" lines. — [Best practices](https://code.claude.com/docs/en/best-practices)
- Two kinds of instructions: non-deterministic (prompt, CLAUDE.md, skills: "there's no *guarantee* that it'll follow your instructions") vs deterministic (hooks, deny rules, managed settings: "Claude Code applies this every time"). "If you keep adding emphasis to a `CLAUDE.md` line and Claude still misses it, that's a sign the line belongs in a hook." — [Best practices](https://code.claude.com/docs/en/best-practices)
- "If something has to happen every time, make it a hook, a deny rule, or a managed setting. `CLAUDE.md` is for guidelines, and Claude is allowed to decide a guideline doesn't apply." — [Best practices](https://code.claude.com/docs/en/best-practices)
- Steering: "Watch the first minute, press `Esc` the moment Claude drifts, and after two failed corrections run `/clear` and write a better prompt instead of a third." A third correction "mostly adds to a conversation that already contains two failed attempts for Claude to keep re-reading." — [Best practices](https://code.claude.com/docs/en/best-practices)
- `/rewind` rolls back code, conversation, or both to an earlier prompt, making it "low-risk to try the bolder approach first"; but checkpoints don't cover files changed only by shell commands and "work alongside git rather than replacing it." — [Best practices](https://code.claude.com/docs/en/best-practices)
- Context: "`/clear` between unrelated tasks ... a focused context gets you better answers and costs less." With 1M-token windows and auto-compaction, running out is rare, so the old "manage the context window aggressively" advice is listed under "What you can stop doing", but `/clear` between tasks "is still worth doing". — [Best practices](https://code.claude.com/docs/en/best-practices)
- Subagents/fresh eyes: "Handing the same task to a subagent doesn't make the answer any better. A fresh reviewer does help, because it hasn't seen your reasoning." A second session "is also the easiest independent reviewer you can get." — [Best practices](https://code.claude.com/docs/en/best-practices)
- Review against the spec, correctness only: "use a subagent to review the rate limiter diff against SPEC.md, check every requirement is implemented and the listed edge cases have tests, report gaps that affect correctness and skip style." Warning: "A reviewer that's asked to find problems will always find *something*. If you fix every finding, you end up with extra abstraction layers and tests for cases that can't happen." — [Best practices](https://code.claude.com/docs/en/best-practices)
- Unattended runs checklist: "Does it know what done looks like? ... Can it check its own work? ... What's it allowed to touch? ... What stops it? ... Where does the result go, and who signs off?" Also: "Try it on three files first, see what goes wrong, fix the prompt, then run the rest." — [Best practices](https://code.claude.com/docs/en/best-practices)
- Old advice now dropped: ALL CAPS/IMPORTANT ("piling on emphasis mostly makes Claude over-apply the rule"), "keep going / don't be lazy" ("more likely to cause over-work than fix a stall. Giving Claude a check to pass is different, and still worth doing"), describing file layout in CLAUDE.md. — [Best practices](https://code.claude.com/docs/en/best-practices)
- The earlier "explore, plan, code, commit" and "write tests, commit; code, iterate, commit" workflows are attributed to the original Anthropic best-practices post (April 2025); that URL now redirects to the docs page above, which no longer frames it that way. — [Search summary referencing anthropic.com/engineering/claude-code-best-practices](https://www.anthropic.com/engineering/claude-code-best-practices) (redirects to [docs](https://code.claude.com/docs/en/best-practices))
- Context engineering post (Sep 29, 2025): context is "a finite resource with diminishing marginal returns" and "Every new token introduced depletes this budget"; "context rot" = recall decreases as context grows; recommends structured notes "persisted to memory outside of the context window", compaction, and sub-agents that each return "a condensed, distilled summary". — [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Same post: don't "stuff a laundry list of edge cases into a prompt"; instead "curate a set of diverse, canonical examples that effectively portray the expected behavior". — [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Anthropic's report "How Anthropic teams use Claude Code" includes non-technical teams (legal, marketing, finance staff without coding experience running workflows). I only saw snippets, not its specific tips. — [Anthropic PDF](https://www-cdn.anthropic.com/58284b19e702b49db9302d5b6f135ad8871e7658.pdf)

### Inferences
- For a phone-based non-coder, the highest-leverage official advice is the one that removes them from being "the test suite": a single command Claude runs after every change, written in CLAUDE.md, plus the habit of asking "show me the command and the output".
- The "two failed corrections then start fresh" rule is concrete and easy to teach in plain words: "if you've had to correct it twice, start a new chat and give one better message."
- This repo already follows the pattern: CLAUDE.md names `node tools/tests/logic.js` and `node tools/tests/layers.js` as the checks to run before pushing, and `tools/tests/layers.js` (486 lines) states "Every expected result comes from the Comprehensive Rules (the examples under rule 613 and others), an official ruling, or the card's oracle text," marking uncited cases "derived". The next step up the strictness ladder would be a Stop hook or CI job that runs them automatically.

### Gaps
- Could not read the original April 2025 engineering post text (it now redirects), so exact old wording of "explore, plan, code, commit" is from secondary summaries.
- Did not find Anthropic guidance written specifically for non-programmers on phones; the advice above is written for developers and must be translated.

## Golden examples / test cases first: evidence that tests and verification loops help

### Takeaway
There is direct evidence that giving an LLM test cases alongside the problem raises correctness, plus a smaller further gain from feeding failing-test results back in; practitioners (Simon Willison) and Anthropic both name tests/red-green TDD as the key practice. The main caveats: passing tests do not prove the program is right, and models can "game" tests (hard-coding expected answers), so the expected answers must come from an authority the human controls, not from Claude.

### Cited Findings
- Mathews and Nagappan (arXiv 2402.13521; published at ASE 2024 as "Test-Driven Development and LLM-based Code Generation") tested GPT-4 and Llama 3 on MBPP and HumanEval and report that including test cases with the problem statement "leads to higher success in solving programming challenges." — [arXiv abstract](https://arxiv.org/abs/2402.13521); [Semantic Scholar](https://www.semanticscholar.org/paper/Test-Driven-Development-for-Code-Generation-Mathews-Nagappan/43ff3632d6e14891d1591a93c0c294cf3016e1c0)
- Same paper: feeding test results back for iterative refinement added modest further gains (reported around 2.8% on MBPP and 3% on HumanEval, from a partly garbled snippet; unverified against the PDF). A secondary review cites ~38.6% overall improvement across MBPP, HumanEval and CodeChef; I could not confirm this in the primary text. — [arXiv PDF (via search snippet)](https://arxiv.org/pdf/2402.13521)
- Limitation noted by later work: the approach depends on human-crafted tests from existing datasets. — [search summary of follow-on work](https://arxiv.org/pdf/2402.13521)
- LLM4TDD (Piya and Sullivan) guides LLMs to generate code iteratively with a TDD methodology, evaluated with ChatGPT on LeetCode, and studies how test, prompt and problem attributes affect results. — [arXiv 2312.04687](https://export.arxiv.org/pdf/2312.04687)
- TiCoder uses tests to clarify user intent and rank candidate code (a user study of test-driven interactive code generation); authors note it may not scale to more complex tasks. — [arXiv 2404.10100](https://arxiv.org/pdf/2404.10100)
- A 2026 survey covers "Test-Driven Approaches to Software Engineering with Large Language Models" (not read in full). — [arXiv 2609.12012](https://arxiv.org/pdf/2609.12012)
- Simon Willison: LLMs reward strong engineering practice; "a robust, comprehensive and stable test suite" lets agentic tools work effectively (Oct 2025, "Vibe engineering"). — [simonwillison.net (snippet)](https://simonwillison.net/2025/Oct/7/vibe-engineering/)
- Willison (Feb 2026) highlighted "Use red/green TDD" as a concise prompt for better agent results; his guide says test-first TDD "is a powerful way to ensure they have exercised the code they are writing," but cautions passing tests don't guarantee the code works as intended, and that having the agent manually exercise the result often catches issues automated tests miss. — [Agentic engineering patterns (snippet)](https://simonwillison.net/2026/Feb/23/agentic-engineering-patterns/); [Agentic manual testing (snippet)](https://simonwillison.net/guides/agentic-engineering-patterns/agentic-manual-testing)
- Willison (Jan 2026): agents follow the patterns already in a project's test suite; once there are clean basic tests, new tests tend to match their quality. — [simonwillison.net (snippet)](https://simonwillison.net/2026/jan/26/tests)
- Test gaming risk: Anthropic's Claude 4 system card (May 2025) describes reward hacking in coding, including writing code that outputs expected values directly and narrow solutions that only pass the tests ("hard-coding and special-casing"); newer models showed much less of it and simple prompts reduced it further (figures from a forum post quoting the card). — [Claude Opus 4 / Sonnet 4 system card discussion](https://leanprover-community.github.io/archive/stream/219941-Machine-Learning-for-Theorem-Proving/topic/System.20card.3A.20Claude.20Opus.204.20.26.20Claude.20Sonnet.204.html); [Sonnet 4.5 system card](https://assets.anthropic.com/m/12f214efcc2f457a/original/claude-sonnet-4-5-system-card.pdf)
- Anthropic: prefer "diverse, canonical examples" over a laundry list of edge cases in the prompt. — [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Anthropic: "A script that diffs output against a fixture" is a valid pass/fail check (a golden-file test). — [Best practices](https://code.claude.com/docs/en/best-practices)

### Inferences
- For a rules engine, the most practical "golden examples" are worked examples from the authority itself (here: the examples printed under Comprehensive Rules sections and official rulings), each written as "these cards, in this order -> this result, because rule X". A non-coder can write these in plain sentences; Claude turns them into a test file.
- Red/green matters for a non-coder because it proves the test actually checks something: ask Claude to show the new case failing before the fix and passing after.
- To guard against test-gaming: tell Claude never to change an expected answer without asking, and have the test file cite where each expected answer comes from (as this repo's layers test does), so a changed answer stands out.
- Add every real bug as a new case (regression test); the test list grows into the engine's memory of past mistakes.

### Gaps
- Could not open the arXiv PDF to quote exact effect sizes; numbers above are flagged as snippet/secondary.
- Found no controlled study specifically on non-programmers using test cases with AI coding tools.

## Writing a plain-language spec (every rule, precedence, what happens when nothing matches)

### Takeaway
Both Anthropic (interview -> SPEC.md -> fresh build session -> review against SPEC.md) and GitHub's Spec Kit (spec drives plan, tasks and implementation) make a written spec the centre of AI-assisted building; the spec doubles as the reviewer's checklist. Decision-table practice adds the two things specs usually forget: an explicit rule for which rule wins when several match, and an explicit outcome when none match.

### Cited Findings
- Anthropic: interview until Claude "could write the spec, then write it to SPEC.md", build in a fresh session with "a written definition of done", and later have a reviewer "check every requirement is implemented and the listed edge cases have tests." — [Best practices](https://code.claude.com/docs/en/best-practices)
- GitHub Spec Kit (Sept 2025): "Spec Kit makes your specification the center of your engineering process. Instead of writing a spec and setting it aside, the spec drives the implementation, checklists, and task breakdowns." To change direction: "just update the spec, regenerate the plan, and let the coding agent handle the rest." Works with Claude Code among others. — [GitHub blog](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)
- A secondary write-up describes Spec Kit's phases as constitution, specify, clarify, plan, tasks, implement. — [search summary of Spec Kit coverage](https://github.github.com/spec-kit/index.html)
- Criticism: Gojko Adzic frames spec-driven development as both a logical evolution and a potential overcorrection (comparisons to waterfall and BDD). — [DevOps.com](https://devops.com/githubs-spec-kit-puts-the-spec-back-in-software-development/)
- DMN "Unique" hit policy (the default): rules must not overlap; Camunda notes it makes it easy to ensure rules are "complete", so nothing is forgotten, and overlaps become errors. "First" depends on row order and Camunda warns it "can be more tricky and error prone to argue about ... than it might occur to you at first sight." "Priority" ranks outputs instead of rows. — [Camunda: Choosing the DMN hit policy (snippet)](https://camunda.com/best-practices/choosing-the-dmn-hit-policy/); [Camunda DMN hit policy reference](https://docs.camunda.org/manual/7.22/reference/dmn/decision-table/hit-policy)
- Oracle: Priority ranking is "specified as a list in the Allowed Values cell of the output column." — [Oracle: About Hit Policies](https://docs.oracle.com/en/cloud/paas/application-integration/decision-modeling/hit-policies.html)

### Inferences
- A spec template a non-coder can fill in: (1) what goes in, (2) what comes out, (3) each rule in one sentence with its source, (4) when two rules disagree, which wins and why (for MTG this is often already written: timestamps, layers in rule 613, dependency, "can't beats can"), (5) what the engine says when no rule applies ("not modeled, work it out by hand" rather than guessing), (6) out of scope, (7) the golden examples.
- The "nothing matched" outcome is the one most often missing; this repo's layer engine handles it with an explicit "NOT MODELED" list, which is the right pattern.

### Gaps
- Could not fetch the full Camunda best-practices page; DMN quotes are from search snippets.

## Rules as data (decision tables, JSON/YAML lists) rather than buried in code

### Takeaway
Decision tables (standardised as OMG DMN and used by Camunda, Oracle, Red Hat/Drools) exist precisely so business people can read and maintain rules without reading code; each row is a rule, columns are conditions and outcome, and a declared hit policy states how conflicts are settled. The same idea works informally: a spreadsheet or JSON list Claude's code reads.

### Cited Findings
- DMN decision tables declare a hit policy; if none is set, UNIQUE is used. — [Camunda DMN hit policy](https://docs.camunda.org/manual/7.22/reference/dmn/decision-table/hit-policy)
- Hit policies for guided decision tables are documented for business-facing tooling in Red Hat Decision Manager. — [Red Hat docs](https://docs.redhat.com/en/documentation/red_hat_decision_manager/7.1/html/designing_a_decision_service_using_guided_decision_tables/hit-policies-con)
- Camunda notes most situations can be handled by more than one policy, and the choice mainly affects readability and maintainability (snippet). — [Camunda best practice](https://camunda.com/best-practices/choosing-the-dmn-hit-policy/)
- Anthropic: CLAUDE.md should hold decisions not in the repo; procedures go in skills; facts Claude would otherwise rediscover should be written down. — [Best practices](https://code.claude.com/docs/en/best-practices)

### Inferences
- For a non-coder, a table they can open on a phone (one row per rule: when, then, source, priority) is checkable in a way that JavaScript is not. Claude can be asked to generate such a table from the code and to flag any rule in the code that isn't in the table, giving a two-way check.
- In this repo, card text, rulings and the CR already live as data files (`docs/data/*.json`) and CLAUDE.md forbids writing card text from memory; extending that to the engine's own rule list (which effect goes in which layer, with CR cite) follows the same principle.
- Full DMN tooling is likely overkill for one person; the useful borrowings are: one row per rule, a stated conflict policy, a default/else row, and a source column.

### Gaps
- Found no study measuring whether non-programmers catch more errors in decision tables than in code; the readability claim rests on vendor/practitioner material.

## Making the engine explain its answer (traceability)

### Takeaway
An answer that lists which rule fired, in what order, with its citation, turns silent errors into visible ones a non-coder can check against the rulebook; this pairs with Anthropic's "ask for evidence" principle. Sources here are thinner; the support is mostly inference from the verification guidance.

### Cited Findings
- Anthropic: ask for evidence (command and output) because "'All tests pass' on its own tells you very little." — [Best practices](https://code.claude.com/docs/en/best-practices)
- Willison: passing tests don't guarantee correct behaviour; manually exercising the result catches what tests miss (snippet). — [Agentic manual testing](https://simonwillison.net/guides/agentic-engineering-patterns/agentic-manual-testing)
- Anthropic's `/verify` runs the app and looks at the result, catching problems tests miss. — [Best practices](https://code.claude.com/docs/en/best-practices)

### Inferences
- Trace output = a test the human can do without code: read each step, check its cited rule says that. This repo's `tools/layers.js` already prints "each layer step with its CR cite, every other result when the arrival order matters, the state-based actions that follow, and a 'NOT MODELED' list" (per CLAUDE.md); that is a strong traceability design.
- Showing every outcome when order matters, and an explicit "not modeled" list, prevents the worst failure for a rules judge: a confident answer for a case the engine doesn't actually handle.

### Gaps
- No primary research found on explanation traces improving error detection by non-experts in LLM-built rule engines.

## Small scope, one rule at a time, committing working versions

### Takeaway
Anthropic recommends small, specific requests, checkpoints/rewind for cheap experiments, and git as the real safety net; trying a batch change on a few items first. Committing after each green test run gives a non-coder a "last known good" to return to.

### Cited Findings
- `/rewind` rolls code and/or conversation back; checkpoints "work alongside git rather than replacing it" and miss files changed only by shell commands. — [Best practices](https://code.claude.com/docs/en/best-practices)
- "Try it on three files first, see what goes wrong, fix the prompt, then run the rest." — [Best practices](https://code.claude.com/docs/en/best-practices)
- Unattended work: have a person approve "the merge, the deploy, or anything else you can't take back"; protect `main` with a branch rule a scheduled task can't bypass. — [Best practices](https://code.claude.com/docs/en/best-practices)
- Willison lists version control among practices LLMs reward (snippet). — [Vibe engineering](https://simonwillison.net/2025/Oct/7/vibe-engineering/)
- A third-party blog recommends committing before long autonomous tasks because Claude sometimes takes a wrong turn partway through (secondary). — [search summary](https://www.builder.io/blog/claude-code-tips-best-practices)

### Inferences
- Plain-language version: "One rule per chat. When the checks pass, ask Claude to save a version with a clear name. If something breaks later, ask it to go back to that version."
- Because every request re-reads the conversation, one-rule-per-session also keeps answers focused (see next section).

### Gaps
- No quantitative evidence found on step size vs. AI coding correctness.

## Interviewing, fresh-session review, and context hygiene

### Takeaway
Have Claude interview you to write the spec, build in a fresh session, and have a different fresh session review against the spec for correctness only. Long, multi-topic chats degrade: independent research shows model reliability falls as input grows, and Anthropic says a focused context gives better answers.

### Cited Findings
- Interview prompt and fresh build session — [Best practices](https://code.claude.com/docs/en/best-practices)
- Fresh reviewer helps "because it hasn't seen your reasoning"; second session as independent reviewer; reviewer subagent with read-only tools (`tools: Read, Grep, Glob`) "enforced by Claude Code rather than requested in a prompt." — [Best practices](https://code.claude.com/docs/en/best-practices)
- Chroma "Context Rot" (July 14, 2025; Hong, Troynikov, Huber): evaluated 18 LLMs; performance was non-uniform and fell as input length grew, even on simple tasks; distractors and structure affected results. Note Chroma sells a retrieval database (commercial interest). — [Chroma Research](https://research.trychroma.com/context-rot); [The Decoder](https://the-decoder.com/yet-another-study-finds-that-overloading-llms-with-information-leads-to-worse-results/)
- Anthropic on context rot and finite attention budget — [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

### Inferences
- Plain-language version: "New topic, new chat. Second opinion from a chat that didn't build it. Ask it to check against the spec and the examples, not to nitpick."
- Keep the reviewer's job narrow (correctness vs. spec and golden cases); otherwise it invents work.

### Gaps
- None major beyond those noted above.

## Common pitfalls for beginners

### Takeaway
The pitfalls map one-to-one onto the techniques: long multi-topic chats (context rot, paying for old history), vague requests (Claude builds the smallest plausible thing), accepting "done" without evidence (you become the test suite), asking for everything at once, piling on CAPS instead of enforcing, correcting a third time instead of restarting, and letting the AI write both the code and the expected answers.

### Cited Findings
- Vague vs specific prompt examples; Claude reads requests conservatively. — [Best practices](https://code.claude.com/docs/en/best-practices)
- "Claude said it was done and it wasn't quite" because it couldn't check its work. — [Best practices](https://code.claude.com/docs/en/best-practices)
- Third correction adds to a conversation with "two failed attempts for Claude to keep re-reading". — [Best practices](https://code.claude.com/docs/en/best-practices)
- Emphasis (IMPORTANT/ALL CAPS) makes Claude over-apply rules; must-never rules belong in hooks/deny rules; a line lost in a long CLAUDE.md means "the file needs to be shorter." — [Best practices](https://code.claude.com/docs/en/best-practices)
- Reviewers asked to find problems always find something; fixing every finding adds needless complexity. — [Best practices](https://code.claude.com/docs/en/best-practices)
- Test-gaming (hard-coding, special-casing) documented in Anthropic system cards. — [system card discussion](https://leanprover-community.github.io/archive/stream/219941-Machine-Learning-for-Theorem-Proving/topic/System.20card.3A.20Claude.20Opus.204.20.26.20Claude.20Sonnet.204.html)
- Willison (May 2026) admits he no longer reviews every line agents write and that vibe coding and agentic engineering are blurring for him (snippet), i.e. even experts lean on checks rather than line-by-line reading. — [simonwillison.net](https://simonwillison.net/2026/may/6/vibe-coding-and-agentic-engineering)

### Inferences
- For a non-coder, the safest substitute for reading code is: golden examples with authoritative expected answers, automatic runs of those examples, an explained trace on every answer, and a second session that checks against the spec.
- "Done" should always mean "show me the check you ran and its result."

### Gaps
- No survey data found on which mistakes non-programmers most often make with Claude Code specifically.

module.exports = {
    name: "interactionCreate",
    async execute(interaction: any, client: any) {
        // Slash command handling
        if (interaction.isCommand && interaction.isCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                await interaction.reply({ content: "Command not found.", ephemeral: true });
                return;
            }
            try {
                await command.execute(interaction, client);
            } catch (err: any) {
                console.error(err);
                try { await interaction.reply({ content: "There was an error executing that command.", ephemeral: true }); } catch(e) {}
            }
            return;
        }

        // Button interactions for quick voting / end
        if (interaction.isButton && interaction.isButton()) {
            try {
                const customId = interaction.customId as string;
                // vote button: vote_btn:{electionId}:{optionIndex}
                if (customId.startsWith("vote_btn:")) {
                    const parts = customId.split(":");
                    const electionId = parts[1];
                    const idx = Number(parts[2]);
                    const { getElection, getVoteByVoter, saveVote, computeVoterHash } = require("../utils/db");
                    const { shortId } = require("../utils/id");
                    const election = await getElection(electionId);
                    if (!election) {
                        await interaction.reply({ content: "Election not found.", ephemeral: true });
                        return;
                    }
                    if (election.ended) {
                        await interaction.reply({ content: "This election has already ended.", ephemeral: true });
                        return;
                    }
                    if (!election.options || idx < 0 || idx >= election.options.length) {
                        await interaction.reply({ content: "Invalid option for this election.", ephemeral: true });
                        return;
                    }

                    let finalChoices: any[] = [election.options[idx]];

                    if (election.system === "weighted") {
                        const member = await interaction.guild.members.fetch(interaction.user.id);
                        const roleWeights = election.roleWeights || [];
                        let totalWeight = 1;
                        if (roleWeights.length) {
                            totalWeight = 0;
                            for (const r of roleWeights) {
                                if (member.roles.cache.has(r.roleId)) totalWeight += (r.weight || 0);
                            }
                            if (totalWeight === 0) totalWeight = 1;
                        }
                        finalChoices = [{ choice: election.options[idx], weight: totalWeight }];
                    }

                    const voterHash = computeVoterHash(electionId, interaction.user.id);

                    const vote = {
                        id: shortId(8),
                        electionId,
                        voterHash,
                        choices: finalChoices,
                        createdAt: Date.now(),
                    };
                    await saveVote(vote);

                    await interaction.reply({ content: `Your vote for **${election.options[idx]}** has been recorded anonymously (you may change it anytime).`, ephemeral: true });
                    return;
                }

                // end button: end_btn:{electionId}
                if (customId.startsWith("end_btn:")) {
                    const parts = customId.split(":");
                    const electionId = parts[1];
                    // permission check: ManageGuild required
                    const { PermissionFlagsBits } = require("discord.js");
                    const hasPerm = interaction.member && interaction.member.permissions && interaction.member.permissions.has && interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
                    if (!hasPerm) {
                        await interaction.reply({ content: "You need Manage Server permission to end the election.", ephemeral: true });
                        return;
                    }
                    const { finalizeElection } = require("../utils/scheduler");
                    const { getElection: getE } = require("../utils/db");
                    const election = await getE(electionId);
                    if (!election) {
                        await interaction.reply({ content: "Election not found.", ephemeral: true });
                        return;
                    }
                    if (election.ended) {
                        await interaction.reply({ content: "Election already ended.", ephemeral: true });
                        return;
                    }

                    await finalizeElection(client, electionId);
                    await interaction.reply({ content: `Election **${election.name}** has been finalized by ${interaction.user.tag}.`, ephemeral: true });
                    return;
                }
            } catch (err) {
                console.error("Button interaction error:", err);
                try { await interaction.reply({ content: "There was an error processing your button press.", ephemeral: true }); } catch (e) {}
            }
        }
    },
};
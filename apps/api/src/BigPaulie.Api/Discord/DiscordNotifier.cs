using System.Threading.Channels;

namespace BigPaulie.Api.Discord;

/// <summary>
/// File d'envoi des messages Discord. Les actions du portail n'attendent jamais Discord :
/// elles déposent le message ici et un service de fond l'envoie.
/// </summary>
public sealed class DiscordNotifier
{
    private readonly Channel<(string ChannelId, object Payload)> _queue =
        Channel.CreateBounded<(string, object)>(new BoundedChannelOptions(500) { FullMode = BoundedChannelFullMode.DropOldest });

    public void Enqueue(string? channelId, object payload)
    {
        if (string.IsNullOrWhiteSpace(channelId)) return;
        _queue.Writer.TryWrite((channelId.Trim(), payload));
    }

    internal ChannelReader<(string ChannelId, object Payload)> Reader => _queue.Reader;

    // ---------- Construction de messages ----------

    public const int ColorRed = 0x9E1B1E;
    public const int ColorGreen = 0x1F5A3A;
    public const int ColorOrange = 0xE07A2F;
    public const int ColorSand = 0xD9A441;
    public const int ColorGrey = 0x7C8A99;

    public static object Embed(string title, string description, int color, string? footer = null,
        IEnumerable<(string Name, string Value)>? fields = null, string? url = null, string? content = null,
        string[]? pingRoleIds = null)
    {
        var embed = new
        {
            Title = Truncate(title, 256),
            Description = Truncate(description, 4000),
            Color = color,
            Url = url,
            Timestamp = DateTime.UtcNow.ToString("o"),
            Footer = footer is null ? null : new { Text = Truncate(footer, 2000) },
            Fields = fields?.Take(25).Select(f => new { Name = Truncate(f.Name, 256), Value = Truncate(string.IsNullOrEmpty(f.Value) ? "—" : f.Value, 1024), Inline = false }).ToArray(),
        };

        return new
        {
            Content = content,
            Embeds = new[] { embed },
            // Seuls les rôles explicitement demandés peuvent être mentionnés.
            AllowedMentions = new { Parse = Array.Empty<string>(), Roles = pingRoleIds ?? Array.Empty<string>() },
        };
    }

    /// <summary>Liste formatée tenant dans un champ d'embed (1024 caractères).</summary>
    public static string BulletList(IReadOnlyList<string> lines, int max = 1000)
    {
        if (lines.Count == 0) return "Aucun";
        var sb = new System.Text.StringBuilder();
        for (var i = 0; i < lines.Count; i++)
        {
            var line = "• " + lines[i] + "\n";
            var rest = lines.Count - i;
            if (sb.Length + line.Length > max - 30)
            {
                sb.Append($"… et {rest} autre(s)");
                break;
            }
            sb.Append(line);
        }
        return sb.ToString().TrimEnd();
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..(max - 1)] + "…";
}

public sealed class DiscordSenderService : BackgroundService
{
    private readonly DiscordNotifier _notifier;
    private readonly DiscordRestClient _discord;
    private readonly ILogger<DiscordSenderService> _log;

    public DiscordSenderService(DiscordNotifier notifier, DiscordRestClient discord, ILogger<DiscordSenderService> log)
    {
        _notifier = notifier;
        _discord = discord;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var (channelId, payload) in _notifier.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await _discord.SendMessageAsync(channelId, payload, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Message Discord non envoyé (salon {Channel})", channelId);
            }
        }
    }
}

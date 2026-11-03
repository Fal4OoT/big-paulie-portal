FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/BigPaulie.Bot/BigPaulie.Bot.csproj src/BigPaulie.Bot/
RUN dotnet restore src/BigPaulie.Bot/BigPaulie.Bot.csproj
COPY src/ src/
RUN dotnet publish src/BigPaulie.Bot/BigPaulie.Bot.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/runtime:8.0
WORKDIR /app
COPY --from=build /app .
USER app
ENTRYPOINT ["dotnet", "BigPaulie.Bot.dll"]
